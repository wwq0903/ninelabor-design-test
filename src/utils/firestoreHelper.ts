/**
 * Firestore Helper Utilities
 * Provides data sanitation functions to prevent passing 'undefined' values
 * which cause Firebase Firestore setDoc/updateDoc/addDoc runtime errors.
 */

export function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      // Exclude undefined completely
      continue;
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = sanitizeFirestoreData(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
