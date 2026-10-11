"""Static regression checks only; NOT Firebase Emulator authorization tests."""
from pathlib import Path
rules = Path(__file__).resolve().parents[1].joinpath('firestore.rules').read_text()
block = rules.split('match /payrolls/{payrollId} {',1)[1].split('// Overtime Records Collection',1)[0]
checks = {
    'company creates draft only': "request.resource.data.status == 'DRAFT'" in block,
    'company edits existing draft only': "resource.data.status == 'DRAFT'" in block,
    'company cannot change companyId': 'request.resource.data.companyId == resource.data.companyId' in block,
    'worker reads confirmed or paid only': "resource.data.status in ['CONFIRMED', 'PAID']" in block,
    'create/update separated': 'allow create:' in block and 'allow update:' in block,
}
for name, ok in checks.items(): print(('PASS' if ok else 'FAIL'), name)
assert all(checks.values())
