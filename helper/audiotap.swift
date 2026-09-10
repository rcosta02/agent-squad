// audiotap: records the microphone and the system output (what you hear) into
// separate 16 kHz mono WAV chunks. Prints one JSON line per chunk on stdout.
//   usage: audiotap <outdir> [chunkSeconds]
// Requires macOS 14.2+ (Core Audio process taps). Stop with SIGINT/SIGTERM.
import AVFoundation
import CoreAudio
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else { FileHandle.standardError.write("usage: audiotap <outdir> [chunkSeconds]\n".data(using: .utf8)!); exit(2) }
let outDir = args[1]
let maxChunk = args.count >= 3 ? Double(args[2]) ?? 12 : 12   // hard cap per chunk (s)
let minSpeech = 1.5     // don't cut before this much audio (s)
let pauseSec = 0.6      // trailing silence that ends a chunk (s)
let silenceRms = 120.0  // 16-bit RMS below this = silence
let chunkSeconds = maxChunk
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
let queue = DispatchQueue(label: "audiotap.write")

func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }
func emit(_ obj: [String: Any]) {
  let d = try! JSONSerialization.data(withJSONObject: obj)
  FileHandle.standardOutput.write(d); FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

final class Track {
  let name: String
  var samples = [Int16]()
  var startSample = 0       // absolute sample index where the current buffer starts
  var total = 0             // absolute samples seen
  var silentRun = 0         // trailing silent samples
  var hadSpeech = false
  var index = 0
  var converter: AVAudioConverter?
  var srcFormat: AVAudioFormat?
  init(_ name: String) { self.name = name }

  func push(_ buf: AVAudioPCMBuffer) {
    if converter == nil || srcFormat != buf.format {
      srcFormat = buf.format
      converter = AVAudioConverter(from: buf.format, to: targetFormat)
    }
    guard let conv = converter else { return }
    let ratio = targetFormat.sampleRate / buf.format.sampleRate
    let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio) + 64
    guard let out = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: cap) else { return }
    var consumed = false
    var err: NSError?
    conv.convert(to: out, error: &err) { _, status in
      if consumed { status.pointee = .noDataNow; return nil }
      consumed = true; status.pointee = .haveData; return buf
    }
    if let err = err { log("convert \(name): \(err)"); return }
    let n = Int(out.frameLength)
    guard n > 0, let p = out.int16ChannelData?[0] else { return }
    let chunk = UnsafeBufferPointer(start: p, count: n)
    samples.append(contentsOf: chunk)
    total += n
    var acc = 0.0
    for v in chunk { acc += Double(v) * Double(v) }
    let rms = (acc / Double(n)).squareRoot()
    if rms < silenceRms { silentRun += n } else { silentRun = 0; hadSpeech = true }
    // Before any speech, keep only a short pre-roll so chunks do not start with seconds of silence.
    if !hadSpeech && samples.count > 8000 { let keep = 4800; samples.removeFirst(samples.count - keep); startSample = total - keep }
    let dur = Double(samples.count) / 16000
    let trailing = Double(silentRun) / 16000
    // Cut at a pause once we have something worth transcribing, or at the hard cap.
    if (hadSpeech && dur >= minSpeech && trailing >= pauseSec) || dur >= maxChunk { cut(final: false) }
  }

  func cut(final: Bool) {
    guard hadSpeech || final else { samples.removeAll(keepingCapacity: true); startSample = total; return }
    let start = Double(startSample) / 16000
    let dur = Double(samples.count) / 16000
    if let path = flush(index: index) {
      emit(["track": name, "path": path, "start": start, "dur": dur, "final": final])
      index += 1
    }
    startSample = total
    silentRun = 0
    hadSpeech = false
  }

  /// Writes the accumulated samples as a WAV file and clears the buffer.
  func flush(index: Int) -> String? {
    guard !samples.isEmpty else { return nil }
    let path = "\(outDir)/\(name)-\(String(format: "%04d", index)).wav"
    var d = Data()
    let dataLen = UInt32(samples.count * 2)
    func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
    func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
    d.append("RIFF".data(using: .ascii)!); u32(36 + dataLen); d.append("WAVE".data(using: .ascii)!)
    d.append("fmt ".data(using: .ascii)!); u32(16); u16(1); u16(1); u32(16000); u32(32000); u16(2); u16(16)
    d.append("data".data(using: .ascii)!); u32(dataLen)
    samples.withUnsafeBufferPointer { d.append(Data(buffer: $0)) }
    samples.removeAll(keepingCapacity: true)
    do { try d.write(to: URL(fileURLWithPath: path)); return path } catch { log("write \(path): \(error)"); return nil }
  }
}

let mic = Track("mic")
let sys = Track("sys")

// ---------- microphone ----------
let engine = AVAudioEngine()
if ProcessInfo.processInfo.environment["AUDIOTAP_NO_MIC"] == nil {
  log("mic: starting")
  let input = engine.inputNode
  let inFormat = input.outputFormat(forBus: 0)
  input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { buf, _ in queue.async { mic.push(buf) } }
  do { try engine.start(); log("mic: running \(inFormat.sampleRate) Hz") } catch { log("mic start failed: \(error)") }
}

// ---------- system audio (process tap on all processes) ----------
var tapID = AudioObjectID(kAudioObjectUnknown)
var aggID = AudioObjectID(kAudioObjectUnknown)
var procID: AudioDeviceIOProcID?
var sysFormat: AVAudioFormat?

func startSystemTap() {
  let desc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
  desc.uuid = UUID()
  desc.muteBehavior = .unmuted
  log("sys: creating tap")
  var st = AudioHardwareCreateProcessTap(desc, &tapID)
  log("sys: tap status \(st)")
  guard st == noErr else { log("tap create failed: \(st) (needs System Audio Recording permission)"); return }

  let aggDesc: [String: Any] = [
    kAudioAggregateDeviceNameKey as String: "claude-desk tap",
    kAudioAggregateDeviceUIDKey as String: "claude-desk-tap-\(UUID().uuidString)",
    kAudioAggregateDeviceIsPrivateKey as String: true,
    kAudioAggregateDeviceTapAutoStartKey as String: true,
    kAudioAggregateDeviceTapListKey as String: [[kAudioSubTapUIDKey as String: desc.uuid.uuidString, kAudioSubTapDriftCompensationKey as String: true]]
  ]
  st = AudioHardwareCreateAggregateDevice(aggDesc as CFDictionary, &aggID)
  guard st == noErr else { log("aggregate device failed: \(st)"); return }

  var asbd = AudioStreamBasicDescription()
  var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
  var addr = AudioObjectPropertyAddress(mSelector: kAudioTapPropertyFormat, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  st = AudioObjectGetPropertyData(tapID, &addr, 0, nil, &size, &asbd)
  guard st == noErr, let fmt = AVAudioFormat(streamDescription: &asbd) else { log("tap format failed: \(st)"); return }
  sysFormat = fmt

  st = AudioDeviceCreateIOProcIDWithBlock(&procID, aggID, nil) { _, inData, _, _, _ in
    guard let fmt = sysFormat else { return }
    let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inData))
    guard let first = abl.first, first.mDataByteSize > 0 else { return }
    let frames = AVAudioFrameCount(first.mDataByteSize) / fmt.streamDescription.pointee.mBytesPerFrame
    guard let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: frames) else { return }
    buf.frameLength = frames
    let dst = UnsafeMutableAudioBufferListPointer(buf.mutableAudioBufferList)
    for (i, b) in abl.enumerated() where i < dst.count {
      memcpy(dst[i].mData, b.mData, Int(b.mDataByteSize))
      dst[i].mDataByteSize = b.mDataByteSize
    }
    queue.async { sys.push(buf) }
  }
  guard st == noErr else { log("ioproc failed: \(st)"); return }
  st = AudioDeviceStart(aggID, procID)
  if st != noErr { log("device start failed: \(st)") } else { log("system tap running \(fmt.sampleRate) Hz \(fmt.channelCount) ch") }
}
if ProcessInfo.processInfo.environment["AUDIOTAP_NO_SYS"] == nil {
  // Create the tap from inside the running main loop; the HAL needs it for the permission handshake.
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { log("sys: starting"); startSystemTap(); log("sys: setup returned") }
}

// ---------- shutdown ----------
func shutdown() {
  engine.stop()
  if let p = procID { AudioDeviceStop(aggID, p); AudioDeviceDestroyIOProcID(aggID, p) }
  if aggID != kAudioObjectUnknown { AudioHardwareDestroyAggregateDevice(aggID) }
  if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID) }
  queue.sync { mic.cut(final: true); sys.cut(final: true) }
  emit(["done": true])
  exit(0)
}
signal(SIGINT, SIG_IGN); signal(SIGTERM, SIG_IGN)
let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main); sigint.setEventHandler { shutdown() }; sigint.resume()
let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main); sigterm.setEventHandler { shutdown() }; sigterm.resume()
emit(["started": true, "maxChunk": maxChunk, "pause": pauseSec])
RunLoop.main.run()
