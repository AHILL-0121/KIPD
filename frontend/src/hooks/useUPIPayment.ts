import { useState, useEffect, useCallback } from 'react';
import { PaymentNotification, PaymentNotificationEvent } from '@/lib/payment-plugin';

export function useUPIPayment() {
    const [hasPermission, setHasPermission] = useState<boolean>(false);
    const [latestPayment, setLatestPayment] = useState<PaymentNotificationEvent | null>(null);

    const checkPermission = useCallback(async () => {
        try {
            const { granted } = await PaymentNotification.hasPermission();
            setHasPermission(granted);
            return granted;
        } catch (e) {
            console.warn('Error checking permission, might be running on web outside capacitor', e);
            return false;
        }
    }, []);

    const requestPermission = useCallback(async () => {
        try {
            await PaymentNotification.requestPermission();
            // Usually, when user returns from settings app, the app resumes.
            // Callers should probably re-check permissions on focus.
        } catch (e) {
            console.warn('Error requesting permission', e);
        }
    }, []);

    useEffect(() => {
        checkPermission();

        let listenerObj: any = null;

        const setupListener = async () => {
            try {
                listenerObj = await PaymentNotification.addListener('onPaymentReceived', (event) => {
                    setLatestPayment(event);
                });
            } catch (error) {
                console.warn('Could not setup payment listener. Possibly running on web.', error);
            }
        };

        setupListener();

        return () => {
            if (listenerObj && listenerObj.remove) {
                listenerObj.remove();
            }
        };
    }, [checkPermission]);

    return {
        hasPermission,
        checkPermission,
        requestPermission,
        latestPayment,
        clearLatestPayment: () => setLatestPayment(null),
    };
}
