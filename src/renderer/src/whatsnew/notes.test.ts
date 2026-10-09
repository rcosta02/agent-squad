import assert from 'node:assert/strict'
import { shouldShowWhatsNew } from './show.ts'

const notes = [{ version: '0.2.0' }]
assert.equal(shouldShowWhatsNew(null, '0.2.0', notes), null, 'first run: onboarding instead')
assert.equal(shouldShowWhatsNew({ seenVersion: '0.2.0' }, '0.2.0', notes), null, 'already seen')
assert.equal(shouldShowWhatsNew({}, '0.2.0', notes)?.version, '0.2.0', 'existing user upgrading from a version without the field')
assert.equal(shouldShowWhatsNew({ seenVersion: '0.1.3' }, '0.2.0', notes)?.version, '0.2.0', 'upgrade')
assert.equal(shouldShowWhatsNew({ seenVersion: '0.1.3' }, '0.2.1', notes), null, 'version without a note: nothing shown')
console.log('whatsnew ok')
