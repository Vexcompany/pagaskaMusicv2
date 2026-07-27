/**
 * Notification Settings Component
 * Allow users to enable/disable notifications
 * Save as: src/components/NotificationSettings.jsx
 */

import React, { useState, useEffect } from 'react';
import notificationService from '../services/notificationService';
import './NotificationSettings.css';

export default function NotificationSettings() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    initNotifications();
  }, []);

  const initNotifications = async () => {
    setIsLoading(true);
    try {
      const initialized = await notificationService.init();
      setIsSupported(initialized);
      
      if (initialized) {
        const status = notificationService.getSubscriptionStatus();
        setIsSubscribed(status.isSubscribed);
      }
    } catch (err) {
      console.error('Failed to initialize notifications:', err);
      setMessage('Notifikasi tidak didukung pada browser ini');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleNotification = async () => {
    setIsLoading(true);
    try {
      if (isSubscribed) {
        await notificationService.unsubscribe();
        setIsSubscribed(false);
        setMessage('✓ Notifikasi dimatikan');
      } else {
        await notificationService.subscribe();
        setIsSubscribed(true);
        setMessage('✓ Notifikasi diaktifkan');
      }
      
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Toggle notification error:', err);
      setMessage(`✗ ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="notification-settings">
      <div className="notification-header">
        <h3>🔔 Notifikasi Push</h3>
      </div>

      <div className="notification-body">
        <p className="notification-desc">
          Dapatkan update terbaru tentang musik dan fitur baru langsung di device Anda
        </p>

        <button
          className={`notification-toggle ${isSubscribed ? 'subscribed' : 'unsubscribed'}`}
          onClick={handleToggleNotification}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner"></span>
              Memproses...
            </>
          ) : isSubscribed ? (
            <>
              <span>✓</span>
              Notifikasi Aktif
            </>
          ) : (
            <>
              <span>○</span>
              Aktifkan Notifikasi
            </>
          )}
        </button>

        {message && (
          <div className={`notification-message ${isSubscribed ? 'success' : 'error'}`}>
            {message}
          </div>
        )}

        <div className="notification-info">
          <h4>Apa saja yang akan Anda terima?</h4>
          <ul>
            <li>🎵 Rekomendasi musik baru</li>
            <li>📢 Update fitur SPOTIF</li>
            <li>🎧 Playlist trending</li>
            <li>⚡ Promo & penawaran eksklusif</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
