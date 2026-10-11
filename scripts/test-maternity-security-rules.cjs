const http = require('http');

const PROJECT_ID = 'demo-no-project';
const HOST = '127.0.0.1';
const PORT = 8085;

function makeJwt(uid, email = `${uid}@example.com`) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: uid,
    user_id: uid,
    email,
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`
  })).toString('base64url');
  return `${header}.${payload}.`;
}

function firestoreRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents${path}`,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, data: json, raw: data });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Convert simple JS object to Firestore REST document fields
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (typeof v === 'number') {
      fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map(item => {
            if (typeof item === 'string') return { stringValue: item };
            if (typeof item === 'number') return { integerValue: String(item) };
            if (typeof item === 'object') return { mapValue: { fields: toFirestoreFields(item) } };
            return { stringValue: String(item) };
          })
        }
      };
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

let passedCount = 0;
let failedCount = 0;
const results = [];

function assertTest(name, condition, details = '') {
  if (condition) {
    passedCount++;
    results.push({ name, status: 'PASS', details });
    console.log(`[PASS] ${name}`);
  } else {
    failedCount++;
    results.push({ name, status: 'FAIL', details });
    console.error(`[FAIL] ${name}: ${details}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('Firebase Emulator Security Rules Verification');
  console.log('Target: maternity_cases & maternity_deductions');
  console.log('====================================================\n');

  // 1. Seed users using admin bypass ('owner')
  console.log('>>> [1/6] Seeding user profiles and test data via admin token...');
  
  // Admin user
  await firestoreRequest('PATCH', '/users/admin_u1', {
    fields: toFirestoreFields({ role: 'ADMIN', uid: 'admin_u1', email: 'admin@test.com' })
  }, 'owner');

  // Company A Manager
  await firestoreRequest('PATCH', '/users/comp_a_mgr', {
    fields: toFirestoreFields({ role: 'COMPANY', companyId: 'company_A', uid: 'comp_a_mgr' })
  }, 'owner');

  // Company B Manager
  await firestoreRequest('PATCH', '/users/comp_b_mgr', {
    fields: toFirestoreFields({ role: 'COMPANY', companyId: 'company_B', uid: 'comp_b_mgr' })
  }, 'owner');

  // Active Worker (Company A)
  await firestoreRequest('PATCH', '/users/worker_active', {
    fields: toFirestoreFields({
      role: 'WORKER',
      membershipStatus: 'ACTIVE',
      employeeId: 'emp_active',
      companyId: 'company_A',
      uid: 'worker_active'
    })
  }, 'owner');

  // Pending Worker
  await firestoreRequest('PATCH', '/users/worker_pending', {
    fields: toFirestoreFields({
      role: 'WORKER',
      membershipStatus: 'PENDING',
      employeeId: 'emp_pending',
      uid: 'worker_pending'
    })
  }, 'owner');

  // Seed existing maternity case with existing deductionInfo
  await firestoreRequest('PATCH', '/maternity_cases/case_with_deduction', {
    fields: toFirestoreFields({
      companyId: 'company_A',
      employeeId: 'emp_active',
      createdById: 'comp_a_mgr',
      status: 'UNDER_REVIEW',
      employeeName: '김철수',
      applicationDate: '2026-10-01',
      deductionInfo: {
        deductionId: 'deduct_101',
        source: 'MONTHLY_FREE',
        yearMonth: '2026-10',
        deductedAt: '2026-10-01T10:00:00Z'
      }
    })
  }, 'owner');

  // Seed existing maternity case without deductionInfo
  await firestoreRequest('PATCH', '/maternity_cases/case_no_deduction', {
    fields: toFirestoreFields({
      companyId: 'company_A',
      employeeId: 'emp_active',
      createdById: 'comp_a_mgr',
      status: 'UNDER_REVIEW',
      employeeName: '이영희',
      applicationDate: '2026-10-02'
    })
  }, 'owner');

  // Seed maternity deduction ledger document
  await firestoreRequest('PATCH', '/maternity_deductions/deduct_101', {
    fields: toFirestoreFields({
      companyId: 'company_A',
      caseId: 'case_with_deduction',
      source: 'MONTHLY_FREE',
      yearMonth: '2026-10',
      action: 'DEDUCTION',
      deductedAt: '2026-10-01T10:00:00Z'
    })
  }, 'owner');

  const tokenAdmin = makeJwt('admin_u1');
  const tokenCompA = makeJwt('comp_a_mgr');
  const tokenCompB = makeJwt('comp_b_mgr');
  const tokenWorkerActive = makeJwt('worker_active');
  const tokenWorkerPending = makeJwt('worker_pending');

  console.log('\n>>> [2/6] Test Set 1: Creation Rules (deductionInfo blocking & normal creation)');

  // 1-1. COMPANY creates case with deductionInfo -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('POST', '/maternity_cases?documentId=create_comp_with_deduct', {
      fields: toFirestoreFields({
        companyId: 'company_A',
        employeeId: 'emp_active',
        createdById: 'comp_a_mgr',
        status: 'SUBMITTED',
        deductionInfo: { deductionId: 'fake_deduct' }
      })
    }, tokenCompA);
    assertTest('COMPANY creating case with deductionInfo is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 1-2. WORKER creates case with deductionInfo -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('POST', '/maternity_cases?documentId=create_worker_with_deduct', {
      fields: toFirestoreFields({
        companyId: 'company_A',
        employeeId: 'emp_active',
        createdById: 'worker_active',
        status: 'SUBMITTED',
        deductionInfo: { deductionId: 'fake_deduct' }
      })
    }, tokenWorkerActive);
    assertTest('WORKER creating case with deductionInfo is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 1-3. ADMIN creates case with deductionInfo from client SDK -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('POST', '/maternity_cases?documentId=create_admin_with_deduct', {
      fields: toFirestoreFields({
        companyId: 'company_A',
        employeeId: 'emp_active',
        createdById: 'admin_u1',
        status: 'SUBMITTED',
        deductionInfo: { deductionId: 'fake_deduct' }
      })
    }, tokenAdmin);
    assertTest('ADMIN client creating case with deductionInfo is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 1-4. COMPANY normal case creation (WITHOUT deductionInfo) -> MUST BE 200 (ALLOWED)
  {
    const res = await firestoreRequest('POST', '/maternity_cases?documentId=create_comp_normal', {
      fields: toFirestoreFields({
        companyId: 'company_A',
        employeeId: 'emp_active',
        createdById: 'comp_a_mgr',
        status: 'SUBMITTED',
        employeeName: '정상등록'
      })
    }, tokenCompA);
    assertTest('COMPANY normal case creation (without deductionInfo) is ALLOWED (200)', res.status === 200, `HTTP ${res.status}`);
  }

  // 1-5. WORKER normal case creation (ACTIVE worker for themselves) -> MUST BE 200 (ALLOWED)
  {
    const res = await firestoreRequest('POST', '/maternity_cases?documentId=create_worker_normal', {
      fields: toFirestoreFields({
        companyId: 'company_A',
        employeeId: 'emp_active',
        createdById: 'worker_active',
        status: 'SUBMITTED',
        employeeName: '근로자본인등록'
      })
    }, tokenWorkerActive);
    assertTest('WORKER (ACTIVE) normal case creation is ALLOWED (200)', res.status === 200, `HTTP ${res.status}`);
  }

  // 1-6. PENDING WORKER creation attempt -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('POST', '/maternity_cases?documentId=create_pending_worker', {
      fields: toFirestoreFields({
        companyId: 'company_A',
        employeeId: 'emp_pending',
        createdById: 'worker_pending',
        status: 'SUBMITTED'
      })
    }, tokenWorkerPending);
    assertTest('PENDING WORKER case creation is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  console.log('\n>>> [3/6] Test Set 2: Update Rules (deductionInfo manipulation & tampering)');

  // 2-1. COMPANY attempts to modify deductionInfo -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('PATCH', '/maternity_cases/case_with_deduction?updateMask.fieldPaths=deductionInfo.source', {
      fields: toFirestoreFields({
        deductionInfo: { source: 'PAID_PREPAID' }
      })
    }, tokenCompA);
    assertTest('COMPANY modifying deductionInfo field is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 2-2. COMPANY attempts to inject deductionInfo into case without deduction -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('PATCH', '/maternity_cases/case_no_deduction?updateMask.fieldPaths=deductionInfo', {
      fields: toFirestoreFields({
        deductionInfo: { deductionId: 'injected_id' }
      })
    }, tokenCompA);
    assertTest('COMPANY injecting deductionInfo into existing case is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 2-3. COMPANY attempts to remove/nullify deductionInfo -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('PATCH', '/maternity_cases/case_with_deduction?updateMask.fieldPaths=deductionInfo', {
      fields: toFirestoreFields({
        deductionInfo: null
      })
    }, tokenCompA);
    assertTest('COMPANY removing deductionInfo (nullify) is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 2-4. ADMIN client attempts to modify deductionInfo -> MUST BE 403 (DENIED, server-only)
  {
    const res = await firestoreRequest('PATCH', '/maternity_cases/case_with_deduction?updateMask.fieldPaths=deductionInfo.source', {
      fields: toFirestoreFields({
        deductionInfo: { source: 'PAID_PREPAID' }
      })
    }, tokenAdmin);
    assertTest('ADMIN client SDK modifying deductionInfo is BLOCKED (403, server transaction only)', res.status === 403, `HTTP ${res.status}`);
  }

  // 2-5. WORKER attempts any update on maternity case -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('PATCH', '/maternity_cases/case_with_deduction?updateMask.fieldPaths=employeeName', {
      fields: toFirestoreFields({
        employeeName: '근로자변조시도'
      })
    }, tokenWorkerActive);
    assertTest('WORKER attempting update on maternity case is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  console.log('\n>>> [4/6] Test Set 3: Normal Business Field Updates & Isolation');

  // 3-1. ADMIN updates normal business field (assignedLaborAttorneyId, internalNotes, status) -> MUST BE 200 (ALLOWED)
  {
    const res = await firestoreRequest('PATCH', '/maternity_cases/case_with_deduction?updateMask.fieldPaths=status&updateMask.fieldPaths=assignedLaborAttorneyId', {
      fields: toFirestoreFields({
        status: 'ASSIGNED',
        assignedLaborAttorneyId: 'labor_attorney_77'
      })
    }, tokenAdmin);
    assertTest('ADMIN updating normal business fields (status, attorney) is ALLOWED (200)', res.status === 200, `HTTP ${res.status}`);
  }

  // 3-2. COMPANY updates allowed business field (employeeName) in own company case -> MUST BE 200 (ALLOWED)
  {
    const res = await firestoreRequest('PATCH', '/maternity_cases/case_with_deduction?updateMask.fieldPaths=employeeName', {
      fields: toFirestoreFields({
        employeeName: '김철수_수정'
      })
    }, tokenCompA);
    assertTest('COMPANY updating normal business field in own case is ALLOWED (200)', res.status === 200, `HTTP ${res.status}`);
  }

  // 3-3. COMPANY B attempts to update Company A case -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('PATCH', '/maternity_cases/case_with_deduction?updateMask.fieldPaths=employeeName', {
      fields: toFirestoreFields({
        employeeName: '타사침입'
      })
    }, tokenCompB);
    assertTest('Cross-company (Company B -> Company A case) update is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 3-4. COMPANY B attempts to read Company A case -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('GET', '/maternity_cases/case_with_deduction', null, tokenCompB);
    assertTest('Cross-company (Company B -> Company A case) read is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 3-5. COMPANY A reads own case -> MUST BE 200 (ALLOWED)
  {
    const res = await firestoreRequest('GET', '/maternity_cases/case_with_deduction', null, tokenCompA);
    assertTest('COMPANY A reading own case is ALLOWED (200)', res.status === 200, `HTTP ${res.status}`);
  }

  console.log('\n>>> [5/6] Test Set 4: Maternity Deductions Ledger Security (maternity_deductions)');

  // 4-1. Client direct create on maternity_deductions (ADMIN client) -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('POST', '/maternity_deductions?documentId=client_direct_deduct_admin', {
      fields: toFirestoreFields({
        companyId: 'company_A',
        caseId: 'case_with_deduction',
        source: 'MONTHLY_FREE'
      })
    }, tokenAdmin);
    assertTest('ADMIN client SDK writing directly to maternity_deductions is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 4-2. Client direct create on maternity_deductions (COMPANY) -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('POST', '/maternity_deductions?documentId=client_direct_deduct_comp', {
      fields: toFirestoreFields({
        companyId: 'company_A',
        caseId: 'case_with_deduction',
        source: 'MONTHLY_FREE'
      })
    }, tokenCompA);
    assertTest('COMPANY writing directly to maternity_deductions is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 4-3. Client direct update on maternity_deductions -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('PATCH', '/maternity_deductions/deduct_101?updateMask.fieldPaths=action', {
      fields: toFirestoreFields({
        action: 'TAMPERED'
      })
    }, tokenCompA);
    assertTest('COMPANY updating maternity_deductions is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 4-4. Client direct delete on maternity_deductions -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('DELETE', '/maternity_deductions/deduct_101', null, tokenCompA);
    assertTest('COMPANY deleting maternity_deductions is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 4-5. COMPANY reads own company maternity_deductions -> MUST BE 200 (ALLOWED)
  {
    const res = await firestoreRequest('GET', '/maternity_deductions/deduct_101', null, tokenCompA);
    assertTest('COMPANY reading own company deduction ledger is ALLOWED (200)', res.status === 200, `HTTP ${res.status}`);
  }

  // 4-6. COMPANY B reads Company A maternity_deductions -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('GET', '/maternity_deductions/deduct_101', null, tokenCompB);
    assertTest('Cross-company reading deduction ledger is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 4-7. WORKER reads maternity_deductions -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('GET', '/maternity_deductions/deduct_101', null, tokenWorkerActive);
    assertTest('WORKER reading deduction ledger is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  console.log('\n>>> [6/6] Test Set 5: Delete Permissions on maternity_cases');

  // 5-1. COMPANY attempts to delete maternity case -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('DELETE', '/maternity_cases/case_no_deduction', null, tokenCompA);
    assertTest('COMPANY deleting maternity case is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 5-2. WORKER attempts to delete maternity case -> MUST BE 403 (DENIED)
  {
    const res = await firestoreRequest('DELETE', '/maternity_cases/case_no_deduction', null, tokenWorkerActive);
    assertTest('WORKER deleting maternity case is BLOCKED (403)', res.status === 403, `HTTP ${res.status}`);
  }

  // 5-3. ADMIN deletes maternity case -> MUST BE 200 (ALLOWED)
  {
    const res = await firestoreRequest('DELETE', '/maternity_cases/case_no_deduction', null, tokenAdmin);
    assertTest('ADMIN deleting maternity case is ALLOWED (200)', res.status === 200, `HTTP ${res.status}`);
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: Total ${passedCount + failedCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
