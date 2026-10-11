from pathlib import Path
import re
s = (Path(__file__).resolve().parents[1] / "firestore.rules").read_text()
for name in ("workers", "documents", "payrolls", "overtime_records", "messages"):
    m = re.search(r"    match /"+name+r"/\{\w+\} \{(.*?)\n    \}", s, re.S)
    assert m, name
    body = m.group(1)
    assert ("canAccessTaggedBranch(resource.data)" in body or "adminCanAccessOptionalCompany(resource.data)" in body), name
    assert ("canAccessTaggedBranch(request.resource.data)" in body or "adminCanAccessOptionalCompany(request.resource.data)" in body), name
    if name != "messages":
        assert "taggedBranchUnchanged()" in body, name
print("PASS: five collection rule blocks include staged branch guards")
