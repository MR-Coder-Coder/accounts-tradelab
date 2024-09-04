const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();


// Telegram Bot Token and Chat ID
const TELEGRAM_TOKEN = '7253641919:AAFlWRWg_hHDs0UDxTpLky6lCeBIidHRn4k';
const CHAT_ID = '-4521301276';

// Function to send a message to Telegram
const sendTelegramMessage = async (message) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await axios.post(url, {
        chat_id: CHAT_ID,
        text: message,
    });
};

exports.notifyOnLatestBetfairEventUpdate = functions.firestore
    .document('latest-betfair-event/{docId}')
    .onUpdate(async (change, context) => {
        const after = change.after.data();
        const docId = context.params.docId;

        // Extract the necessary fields
        const eventName = after.eventDetails?.name || 'Unknown Event';
        const competitionName = after.eventDetails?.[0]?.competitionName || 'Unknown Competition';

        const message = `
📢 *Latest Betfair Event Updated* 📢

*Event ID*: ${docId}
*Event Name*: ${eventName}
*Competition Name*: ${competitionName}
        `;

        try {
            await sendTelegramMessage(message);
            console.log('Message sent to Telegram successfully.');
        } catch (error) {
            console.error('Error sending message to Telegram:', error);
        }
    });


/*    *Other Fields*:
    ${JSON.stringify(after, null, 2)}
*/