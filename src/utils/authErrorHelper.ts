/**
 * Firebase Authentication & Firestore Korean Error Message Helper
 * Converts internal Firebase error codes and English technical messages
 * into clear, user-friendly Korean guidance.
 */

export function getFirebaseAuthErrorMessage(
  error: any,
  context: 'login' | 'signup' | 'reset' | 'general' = 'general'
): string {
  if (!error) {
    return context === 'signup'
      ? '회원가입 처리 중 오류가 발생했습니다. 다시 시도해 주세요.'
      : context === 'login'
      ? '로그인 처리 중 오류가 발생했습니다. 다시 시도해 주세요.'
      : '요청 처리 중 오류가 발생했습니다. 다시 시도해 주세요.';
  }

  // Extract error code from error.code or error.message regex
  let code = typeof error === 'string' ? error : error?.code || '';
  const rawMessage = typeof error === 'string' ? error : error?.message || '';

  if (!code && typeof rawMessage === 'string') {
    const match = rawMessage.match(/auth\/[a-z0-9-]+/i);
    if (match) {
      code = match[0].toLowerCase();
    }
  }

  // Detect Firestore or Document write errors
  if (
    rawMessage.includes('setDoc') ||
    rawMessage.includes('addDoc') ||
    rawMessage.includes('updateDoc') ||
    rawMessage.includes('Unsupported field value') ||
    code === 'firestore/invalid-data'
  ) {
    return '회원정보 저장 중 문제가 발생했습니다. 다시 시도해주세요.';
  }

  if (
    code === 'permission-denied' ||
    rawMessage.includes('permission-denied') ||
    rawMessage.includes('insufficient permissions')
  ) {
    return '접근 권한이 없거나 회원정보 저장 중 문제가 발생했습니다. 관리자에게 문의해주세요.';
  }

  // Check specific Firebase Auth error codes
  switch (code) {
    case 'auth/operation-not-allowed':
      return context === 'signup'
        ? '회원가입 기능(이메일/비밀번호 Provider)이 비활성화되어 있습니다. Firebase Console > Authentication > Sign-in method에서 이메일/비밀번호 공급자를 활성화해주세요.'
        : '이메일/비밀번호(Email/Password) 로그인 방식이 활성화되지 않았습니다. Firebase Console > Authentication > Sign-in method에서 이메일/비밀번호 공급자를 활성화해주세요.';

    case 'auth/invalid-api-key':
      return 'Firebase API Key가 유효하지 않습니다. 프로젝트 설정을 확인해주세요.';

    case 'auth/configuration-not-found':
      return 'Firebase Authentication 프로젝트 구성 또는 설정을 찾을 수 없습니다. Firebase Console 설정을 확인해주세요.';

    case 'auth/unauthorized-domain':
      return '현재 웹 도메인이 Firebase Authentication 승인된 도메인(Authorized Domains)에 등록되지 않았습니다. Firebase Console에서 도메인을 추가해주세요.';

    case 'auth/email-already-in-use':
      return '이미 가입된 이메일 주소입니다. 로그인을 진행해주세요.';

    case 'auth/invalid-email':
      return '올바른 이메일 주소 형식을 입력해주세요.';

    case 'auth/weak-password':
      return '비밀번호를 더 안전하게 설정해주세요. (최소 6자 이상)';

    case 'auth/wrong-password':
      return '비밀번호가 올바르지 않습니다. 다시 확인해주세요.';

    case 'auth/invalid-credential':
      return '이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해주세요.';

    case 'auth/user-not-found':
      return context === 'reset'
        ? '해당 이메일로 등록된 계정을 찾을 수 없습니다.'
        : '등록되지 않은 계정입니다. 이메일을 확인하거나 회원가입을 진행해주세요.';

    case 'auth/too-many-requests':
      return '비정상적인 접근 시도가 많아 일시적으로 차단되었습니다. 잠시 후 다시 시도해주세요.';

    case 'auth/user-disabled':
      return '운영 정책에 의해 비활성화된 계정입니다. 관리자에게 문의해주세요.';

    case 'auth/account-exists-with-different-credential':
      return '이미 다른 로그인 방식으로 가입된 계정입니다. 기존 로그인 방식으로 시도해주세요.';

    case 'auth/popup-closed-by-user':
      return '로그인 팝업창이 닫혔습니다. 다시 시도해주세요.';

    case 'auth/popup-blocked':
      return '브라우저 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.';

    case 'auth/network-request-failed':
      return '네트워크 연결이 불안정합니다. 인터넷 연결을 확인하고 다시 시도해주세요.';

    case 'auth/expired-action-code':
      return '인증 링크 또는 코드가 만료되었습니다. 다시 요청해주세요.';

    case 'auth/invalid-action-code':
      return '유효하지 않은 인증 코드입니다.';

    case 'auth/requires-recent-login':
      return '보안을 위해 다시 로그인한 후 시도해주세요.';

    case 'auth/internal-error':
      return 'Firebase 인증 서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

    default:
      break;
  }

  // If rawMessage exists, check if it's already a clean Korean custom error
  // (e.g. custom throw new Error('최고관리자 권한은...'))
  if (rawMessage && typeof rawMessage === 'string') {
    const isTechnicalOrFirebase =
      rawMessage.includes('Firebase:') ||
      rawMessage.includes('FirebaseError') ||
      rawMessage.includes('auth/') ||
      rawMessage.includes('Function') ||
      rawMessage.includes('undefined') ||
      (/[a-zA-Z]{5,}/.test(rawMessage) && !/[가-힣]/.test(rawMessage));

    if (!isTechnicalOrFirebase && /[가-힣]/.test(rawMessage)) {
      return rawMessage;
    }
  }

  // Default friendly fallback based on context
  if (context === 'signup') {
    return '회원정보 저장 중 문제가 발생했습니다. 다시 시도해주세요.';
  }
  if (context === 'login') {
    return '로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (context === 'reset') {
    return '비밀번호 재설정 이메일 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }

  return '요청 처리 중 문제가 발생했습니다. 다시 시도해주세요.';
}
