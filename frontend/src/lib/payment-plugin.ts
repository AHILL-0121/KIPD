import { registerPlugin } from '@capacitor/core';

export interface PaymentNotificationEvent {
    amount: string;
    reference: string;
    packageName: string;
    rawText: string;
    timestamp: number;
}

export interface PaymentNotificationPlugin {
    hasPermission(): Promise<{ granted: boolean }>;
    requestPermission(): Promise<void>;
    addListener(
        eventName: 'onPaymentReceived',
        listenerFunc: (event: PaymentNotificationEvent) => void
    ): Promise<any>;
}

// Ensure it fails gracefully if run outside capacitor
export const PaymentNotification = registerPlugin<PaymentNotificationPlugin>('PaymentNotification');
