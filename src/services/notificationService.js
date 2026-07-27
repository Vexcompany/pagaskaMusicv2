/**
 * Notification Manager
 * Handle push notification subscription and management
 * Save as: src/services/notificationService.js
 */

class NotificationService {
  constructor() {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.registration = null;
    this.subscription = null;
  }

  /**
   * Initialize notification service
   */
  async init() {
    if (!this.isSupported) {
      console.warn('Push notifications not supported in this browser');
      return false;
    }

    try {
      // Register service worker
      this.registration = await navigator.serviceWorker.register(
        '/service-worker.js',
        { scope: '/' }
      );
      console.log('Service Worker registered:', this.registration);

      // Check existing subscription
      const existingSubscription = await this.registration.pushManager.getSubscription();
      if (existingSubscription) {
        this.subscription = existingSubscription;
        console.log('Existing subscription found');
      }

      return true;
    } catch (err) {
      console.error('Failed to initialize notifications:', err);
      return false;
    }
  }

  /**
   * Request notification permission and subscribe
   */
  async subscribe() {
    if (!this.isSupported) {
      throw new Error('Push notifications not supported');
    }

    if (!this.registration) {
      await this.init();
    }

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Get VAPID public key from backend
      const keyResponse = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/notifications/public-key`
      );
      const keyData = await keyResponse.json();

      // Subscribe to push notifications
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(keyData.publicKey)
      });

      // Send subscription to backend
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/notifications/subscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() })
        }
      );

      if (response.ok) {
        this.subscription = subscription;
        console.log('Successfully subscribed to notifications');
        return { success: true, subscription };
      } else {
        throw new Error('Failed to save subscription on server');
      }
    } catch (err) {
      console.error('Subscription error:', err);
      throw err;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe() {
    try {
      if (this.subscription) {
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/notifications/unsubscribe`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: this.subscription.toJSON() })
          }
        );

        await this.subscription.unsubscribe();
        this.subscription = null;

        return { success: true };
      }
    } catch (err) {
      console.error('Unsubscribe error:', err);
      throw err;
    }
  }

  /**
   * Check if user is subscribed
   */
  isSubscribed() {
    return this.subscription !== null;
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Get subscription status
   */
  getSubscriptionStatus() {
    return {
      isSupported: this.isSupported,
      isSubscribed: this.isSubscribed(),
      subscription: this.subscription?.toJSON() || null
    };
  }
}

export default new NotificationService();
