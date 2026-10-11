"""Static checks only. Firebase Emulator authorization tests remain mandatory."""
from pathlib import Path
rules = Path(__file__).resolve().parents[1].joinpath('firestore.rules').read_text()
for collection, following in [('payrolls', '// Overtime Records Collection'), ('overtime_records', '// Overtime Sync Metadata Collection')]:
    block = rules.split(f'match /{collection}/{{', 1)[1].split(following, 1)[0]
    worker_read = block.split("getUserData().role == 'WORKER' &&", 1)[1].split('allow create:', 1)[0]
    assert "getUserData().companyId != ''" in worker_read
    assert 'resource.data.companyId == getUserData().companyId' in worker_read
    print(f'PASS {collection}: worker read checks company affiliation')
