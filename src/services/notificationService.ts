import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { NotificationItem } from '../types';

export const notificationService = {
  async getUserNotifications(userId: string): Promise<NotificationItem[]> {
    if (!userId) return [];
    const colRef = collection(db, 'notifications');
    try {
      const q = query(
        colRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationItem));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `notifications?userId=${userId}`);
    }
  },

  async createNotification(
    data: Omit<NotificationItem, 'id' | 'createdAt'>
  ): Promise<NotificationItem> {
    const docRef = doc(collection(db, 'notifications'));
    const notifId = docRef.id;
    const now = new Date().toISOString();

    const newNotif: NotificationItem = {
      ...data,
      id: notifId,
      createdAt: now,
    };

    try {
      await setDoc(docRef, newNotif);
      return newNotif;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `notifications/${notifId}`);
    }
  },

  async markAsRead(id: string): Promise<void> {
    const docRef = doc(db, 'notifications', id);
    try {
      await updateDoc(docRef, {
        isRead: true,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  },

  async markAllAsRead(notifications: NotificationItem[]): Promise<void> {
    const unread = notifications.filter((n) => !n.isRead);
    for (const notif of unread) {
      try {
        const docRef = doc(db, 'notifications', notif.id);
        await updateDoc(docRef, { isRead: true });
      } catch (err) {
        console.error('Failed to mark notification as read', err);
      }
    }
  },

  async deleteNotification(id: string): Promise<void> {
    const docRef = doc(db, 'notifications', id);
    try {
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
    }
  },
};
