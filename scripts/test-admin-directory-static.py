from pathlib import Path
import re
rules = (Path(__file__).resolve().parents[1] / 'firestore.rules').read_text()
match = re.search(r'match /admins/\{adminId\}\s*\{(.*?)\n\s*\}', rules, re.S)
assert match, 'admins collection rules missing'
body = match.group(1)
assert 'allow get: if isAdmin() || isCurrentUser(adminId);' in body
assert 'allow list: if isAdmin();' in body
assert 'allow read: if isSignedIn();' not in body
assert 'allow write: if isAdmin();' in body
print('PASS: admin directory access restricted to admins, or own record for get')
