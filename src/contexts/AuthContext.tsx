import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  deleteUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../lib/firebase';
import { UserProfile, UserRole, MembershipType, SignUpType } from '../types';
import { firmService } from '../services/firmService';
import { policyService } from '../services/policyService';
import { sanitizeFirestoreData } from '../utils/firestoreHelper';

export type AuthState =
  | 'authLoading'       // Firebase Auth initialization check
  | 'unauthenticated'   // No Firebase Auth user logged in
  | 'profileLoading'    // Auth user detected, loading/verifying Firestore profile
  | 'profileReady'      // Profile successfully loaded and validated
  | 'profileIncomplete' // Authenticated in Auth, but users/{uid} is missing or has no role
  | 'error';            // Fatal profile load error

export interface SignUpPayload {
  signUpType: SignUpType;
  email: string;
  password?: string;
  displayName: string;
  phone?: string;
  role: 'COMPANY' | 'WORKER';
  membershipType?: MembershipType;
  companyId?: string | null;
  companyName?: string;
  businessNumber?: string;
  department?: string;
  position?: string;
  joinDate?: string;
  maskedRrn?: string;
  hasRrn?: boolean;
  agreedTerms?: boolean;
  agreedPrivacy?: boolean;
  agreedMarketing?: boolean;
}

export interface CompleteProfilePayload {
  signUpType: SignUpType;
  displayName: string;
  phone?: string;
  role: 'COMPANY' | 'WORKER';
  membershipType?: MembershipType;
  companyId?: string | null;
  companyName?: string;
  businessNumber?: string;
  department?: string;
  position?: string;
  joinDate?: string;
  maskedRrn?: string;
  hasRrn?: boolean;
  agreedTerms?: boolean;
  agreedPrivacy?: boolean;
  agreedMarketing?: boolean;
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  authState: AuthState;
  loading: boolean;
  isProfileIncomplete: boolean;
  needsOnboarding: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (payload: SignUpPayload) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  completeOnboarding: (data: CompleteProfilePayload) => Promise<void>;
  updateProfileDetails: (details: { displayName?: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authState, setAuthState] = useState<AuthState>('authLoading');
  const isSigningUpRef = React.useRef(false);

  useEffect(() => {
    // Run boot connection test
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (!user) {
        setUserProfile(null);
        setAuthState('unauthenticated');
        return;
      }

      // If signUpWithEmail is actively running, let it complete profile creation
      if (isSigningUpRef.current) {
        return;
      }

      setAuthState('profileLoading');
      const userDocRef = doc(db, 'users', user.uid);

      try {
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const rawProfile = userDocSnap.data() as UserProfile;
          const effectiveRole = rawProfile.role;

          if (effectiveRole) {
            const profile: UserProfile = {
              ...rawProfile,
              role: effectiveRole,
            };
            setUserProfile(profile);
            setAuthState('profileReady');
          } else {
            // Profile document exists but has no role assigned
            setUserProfile(null);
            setAuthState('profileIncomplete');
          }
        } else {
          // Check if this user is provisioned in the secure admins collection
          // SECURITY RULE: Client MUST NOT self-assign ADMIN role or auto-create admins documents.
          const adminRef = doc(db, 'admins', user.uid);
          const adminSnap = await getDoc(adminRef);

          if (adminSnap.exists()) {
            const adminData = adminSnap.data();
            const adminProfile: UserProfile = {
              uid: user.uid,
              email: user.email || adminData.email || '',
              displayName: user.displayName || adminData.displayName || '최고관리자',
              role: 'ADMIN',
              createdAt: adminData.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            try {
              await setDoc(userDocRef, sanitizeFirestoreData(adminProfile));
            } catch (syncErr) {
              console.warn('Admin user doc sync note:', syncErr);
            }

            setUserProfile(adminProfile);
            setAuthState('profileReady');
          } else {
            // New or orphaned auth user that does not have a Firestore profile
            // IMPORTANT: Do NOT grant default ADMIN or COMPANY role automatically!
            setUserProfile(null);
            setAuthState('profileIncomplete');
          }
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        setUserProfile(null);
        setAuthState('error');
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to profile changes in real time if user is logged in
  useEffect(() => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);

    const unsub = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const prof = snapshot.data() as UserProfile;
          const effectiveRole = prof.role;
          if (effectiveRole) {
            setUserProfile({
              ...prof,
              role: effectiveRole,
            });
            setAuthState('profileReady');
          }
        }
      },
      (error) => {
        console.warn('Realtime profile listener error:', error);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // Real Email/Password Login
  const loginWithEmail = async (email: string, password: string): Promise<void> => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;

      // Immediate check of profile document existence
      const userDocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userDocRef);

      if (snap.exists() && snap.data()?.role) {
        const rawProfile = snap.data() as UserProfile;
        const effectiveRole = rawProfile.role;
        setUserProfile({
          ...rawProfile,
          role: effectiveRole,
        });
        setAuthState('profileReady');
      } else {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        if (adminSnap.exists()) {
          const adminData = adminSnap.data();
          const adminProf: UserProfile = {
            uid: user.uid,
            email: user.email || adminData.email || '',
            displayName: user.displayName || adminData.displayName || '최고관리자',
            role: 'ADMIN',
            createdAt: adminData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setUserProfile(adminProf);
          setAuthState('profileReady');
        } else {
          setUserProfile(null);
          setAuthState('profileIncomplete');
        }
      }
    } catch (error) {
      console.error('Email login failed', error);
      throw error;
    }
  };

  // Real Email/Password Sign Up with explicit rollback on partial failure
  const signUpWithEmail = async (payload: SignUpPayload): Promise<void> => {
    // PUBLIC SIGNUP SECURITY CHECK: Role CANNOT be ADMIN
    if ((payload.role as string) === 'ADMIN') {
      throw new Error('최고관리자(ADMIN) 권한은 공개 회원가입으로 생성할 수 없습니다.');
    }

    if (!payload.email || !payload.email.trim()) {
      throw new Error('이메일 주소를 입력해 주세요.');
    }
    if (!payload.password || payload.password.length < 6) {
      throw new Error('비밀번호는 최소 6자 이상이어야 합니다.');
    }
    if (!payload.displayName || !payload.displayName.trim()) {
      throw new Error('이름(대표자명)을 입력해 주세요.');
    }

    isSigningUpRef.current = true;
    let newlyCreatedUser: FirebaseUser | null = null;

    try {
      // Step 1: Create user in Firebase Auth
      const cred = await createUserWithEmailAndPassword(
        auth,
        payload.email.trim(),
        payload.password
      );
      newlyCreatedUser = cred.user;
      const user = cred.user;
      const now = new Date().toISOString();

      let assignedCompanyId: string | null = payload.companyId || null;
      let assignedCompanyName: string | undefined = payload.companyName?.trim();

      // Step 2: Public signup records a REQUEST only. A new company and its
      // membership must be approved by an administrator; never self-assign a tenant.
      let assignedCompanyId: string | null = payload.signUpType === 'WORKER_AFFILIATED'
        ? payload.companyId || null : null;
      let assignedCompanyName: string | undefined = payload.companyName?.trim();
      if (payload.signUpType === 'WORKER_INDIVIDUAL') {
        assignedCompanyId = null;
        assignedCompanyName = undefined;
      }

      // Step 3: Construct strictly typed UserProfile document without undefined fields
      const profileData: Record<string, any> = {
        uid: user.uid,
        email: user.email || payload.email.trim(),
        displayName: payload.displayName.trim(),
        role: payload.role,
        createdAt: now,
        updatedAt: now,
      };

      if (payload.phone?.trim()) {
        profileData.phone = payload.phone.trim();
      }

      if (payload.signUpType === 'COMPANY_REP' || payload.role === 'COMPANY') {
        profileData.role = 'COMPANY';
        profileData.membershipType = 'COMPANY_AFFILIATED';
        profileData.membershipStatus = 'PENDING_COMPANY_VERIFICATION';
        profileData.companyId = null;
        profileData.requestedCompanyName = assignedCompanyName || '미등록 기업';
        profileData.requestedBusinessNumber = payload.businessNumber?.trim() || '';
      } else if (payload.signUpType === 'WORKER_INDIVIDUAL') {
        profileData.role = 'WORKER';
        profileData.membershipType = 'INDIVIDUAL';
        profileData.membershipStatus = 'ACTIVE';
        profileData.companyId = null;
      } else {
        // WORKER_AFFILIATED: Requires administrator approval
        profileData.role = 'WORKER';
        profileData.membershipType = 'COMPANY_AFFILIATED';
        profileData.membershipStatus = 'PENDING_COMPANY_VERIFICATION';
        profileData.companyId = null;
        profileData.requestedCompanyId = assignedCompanyId;
        profileData.requestedCompanyName = assignedCompanyName || '소속 신청 기업';

        if (payload.department?.trim()) profileData.department = payload.department.trim();
        if (payload.position?.trim()) profileData.position = payload.position.trim();
        if (payload.maskedRrn?.trim()) {
          profileData.maskedRrn = payload.maskedRrn.trim();
          profileData.hasRrn = true;
        }
      }

      // Step 4: Write to Firestore users/{uid} using sanitized data
      const userDocRef = doc(db, 'users', user.uid);
      const sanitizedProfile = sanitizeFirestoreData(profileData);
      await setDoc(userDocRef, sanitizedProfile);

      // Step 5: Save required policy consents with user.uid
      try {
        if (payload.agreedTerms) {
          await policyService.saveConsent(user.uid, 'TERMS_OF_SERVICE', true);
        }
        if (payload.agreedPrivacy) {
          await policyService.saveConsent(user.uid, 'PRIVACY_COLLECTION', true);
        }
        if (payload.agreedMarketing) {
          await policyService.saveConsent(user.uid, 'MARKETING_CONSENT', true);
        }
      } catch (consentErr) {
        console.warn('Policy consent save notice:', consentErr);
      }

      // Step 6: Update internal application state only after full success
      setUserProfile(sanitizedProfile as UserProfile);
      setAuthState('profileReady');
    } catch (error) {
      console.error('Sign up flow encountered an error:', error);

      // Step 7: Rollback freshly created Firebase Auth account if subsequent steps failed
      if (newlyCreatedUser) {
        try {
          console.warn('Rolling back newly created Auth user account:', newlyCreatedUser.uid);
          await deleteUser(newlyCreatedUser);
          console.info('Successfully rolled back newly created Auth user.');
        } catch (rollbackError) {
          console.error('Failed to rollback newly created Auth user:', rollbackError);
        }
      }

      throw error;
    } finally {
      isSigningUpRef.current = false;
    }
  };

  // Google Sign-In
  const signInWithGoogle = async (): Promise<void> => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;

      const userDocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userDocRef);

      if (snap.exists() && snap.data()?.role) {
        const rawProfile = snap.data() as UserProfile;
        const effectiveRole = rawProfile.role;
        setUserProfile({
          ...rawProfile,
          role: effectiveRole,
        });
        setAuthState('profileReady');
      } else {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        if (adminSnap.exists()) {
          const adminData = adminSnap.data();
          const adminProf: UserProfile = {
            uid: user.uid,
            email: user.email || adminData.email || '',
            displayName: user.displayName || adminData.displayName || '최고관리자',
            role: 'ADMIN',
            createdAt: adminData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setUserProfile(adminProf);
          setAuthState('profileReady');
        } else {
          setUserProfile(null);
          setAuthState('profileIncomplete');
        }
      }
    } catch (error) {
      console.error('Google Sign-In failed', error);
      throw error;
    }
  };

  // Password Reset Email
  const sendPasswordReset = async (email: string): Promise<void> => {
    if (!email || !email.trim()) {
      throw new Error('비밀번호를 재설정할 이메일 주소를 입력해 주세요.');
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      console.error('Password reset email failed', error);
      throw error;
    }
  };

  // Complete profile / account recovery for incomplete accounts
  const completeOnboarding = async (
    data: CompleteProfilePayload
  ): Promise<void> => {
    if (!currentUser) throw new Error('로그인 세션이 존재하지 않습니다.');
    if ((data.role as string) === 'ADMIN') {
      throw new Error('최고관리자 권한은 선택할 수 없습니다.');
    }

    const now = new Date().toISOString();
    let assignedCompanyId: string | null = data.companyId || null;
    let assignedCompanyName: string | undefined = data.companyName?.trim();

    // 1. Account recovery follows the same pending-approval policy as email signup.
    // Never create a tenant or assign membership from an untrusted browser.
    if (data.signUpType === 'WORKER_INDIVIDUAL') {
      assignedCompanyId = null;
      assignedCompanyName = undefined;
    }

    // 3. Construct strictly sanitized profile
    const profileData: Record<string, any> = {
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: data.displayName.trim(),
      role: data.role,
      createdAt: now,
      updatedAt: now,
    };

    if (data.phone?.trim()) {
      profileData.phone = data.phone.trim();
    }

    if (data.signUpType === 'COMPANY_REP' || data.role === 'COMPANY') {
      profileData.role = 'COMPANY';
      profileData.membershipType = 'COMPANY_AFFILIATED';
      profileData.membershipStatus = 'PENDING_COMPANY_VERIFICATION';
      profileData.companyId = null;
      profileData.requestedCompanyName = assignedCompanyName || '미등록 기업';
      profileData.requestedBusinessNumber = data.businessNumber?.trim() || '';
    } else if (data.signUpType === 'WORKER_INDIVIDUAL') {
      profileData.role = 'WORKER';
      profileData.membershipType = 'INDIVIDUAL';
      profileData.membershipStatus = 'ACTIVE';
      profileData.companyId = null;
    } else {
      // WORKER_AFFILIATED: PENDING until approved
      profileData.role = 'WORKER';
      profileData.membershipType = 'COMPANY_AFFILIATED';
      profileData.membershipStatus = 'PENDING_COMPANY_VERIFICATION';
      profileData.companyId = null;
      profileData.requestedCompanyId = assignedCompanyId;
      profileData.requestedCompanyName = assignedCompanyName || '소속 신청 기업';

      if (data.department?.trim()) profileData.department = data.department.trim();
      if (data.position?.trim()) profileData.position = data.position.trim();
      if (data.maskedRrn?.trim()) {
        profileData.maskedRrn = data.maskedRrn.trim();
        profileData.hasRrn = true;
      }
    }

    const sanitizedProfile = sanitizeFirestoreData(profileData);
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, sanitizedProfile, { merge: true });

    // Save consents if provided
    try {
      if (data.agreedTerms) {
        await policyService.saveConsent(currentUser.uid, 'TERMS_OF_SERVICE', true);
      }
      if (data.agreedPrivacy) {
        await policyService.saveConsent(currentUser.uid, 'PRIVACY_COLLECTION', true);
      }
      if (data.agreedMarketing) {
        await policyService.saveConsent(currentUser.uid, 'MARKETING_CONSENT', true);
      }
    } catch (consentErr) {
      console.warn('Policy consent save notice:', consentErr);
    }

    setUserProfile(sanitizedProfile as UserProfile);
    setAuthState('profileReady');
  };

  // Regular user profile details update
  const updateProfileDetails = async (details: {
    displayName?: string;
    phone?: string;
  }): Promise<void> => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    try {
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      if (details.displayName) updateData.displayName = details.displayName.trim();
      if (details.phone !== undefined) updateData.phone = details.phone.trim();

      await updateDoc(userDocRef, sanitizeFirestoreData(updateData));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fbSignOut(auth);
      setUserProfile(null);
      setAuthState('unauthenticated');
    } catch (error) {
      console.error('Logout failed', error);
      throw error;
    }
  };

  const refreshProfile = async (): Promise<void> => {
    if (!currentUser) return;
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const prof = snap.data() as UserProfile;
        const effectiveRole = prof.role;
        if (effectiveRole) {
          setUserProfile({
            ...prof,
            role: effectiveRole,
          });
          setAuthState('profileReady');
        } else {
          setUserProfile(null);
          setAuthState('profileIncomplete');
        }
      } else {
        setUserProfile(null);
        setAuthState('profileIncomplete');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
    }
  };

  const loading = authState === 'authLoading' || authState === 'profileLoading';
  const isProfileIncomplete = authState === 'profileIncomplete';
  const needsOnboarding = isProfileIncomplete;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        authState,
        loading,
        isProfileIncomplete,
        needsOnboarding,
        loginWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        sendPasswordReset,
        completeOnboarding,
        updateProfileDetails,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
