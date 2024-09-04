const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

const cleanAmount = (amount) => {
    if (typeof amount === 'number') {
        return Math.abs(amount);
    } else if (typeof amount === 'string') {
        amount = amount.replace(',', '');
        if (amount.startsWith('(') && amount.endsWith(')')) {
            amount = amount.slice(1, -1);
        }
        return Math.abs(parseFloat(amount));
    } else if (amount === null || amount === undefined) {
        return 0.0;
    } else {
        return 0.0;
    }
};

const convertUnixToDate = (unixTimestamp) => {
    const date = new Date(unixTimestamp);
    return date.toLocaleDateString();
};

const processBetfairCollection = async () => {
    const journalEntries = [];
    const betfairCollection = await db.collection('betfair-statement').get();
    let journalNumber = 1;

    betfairCollection.forEach((doc) => {
        const data = doc.data();
        const formattedPlacedDate = data.formattedPlacedDate;
        const event = data.event || {};
        const betDescription = event.betDescription || '';
        const nameAndSelectionName = event.nameAndSelectionName || '';
        const betId = data.betId;
        const winLose = data.winLose;
        const debitAmount = cleanAmount(data.debitAmount);
        const creditAmount = cleanAmount(data.creditAmount);

        let nominalCodeCredit, nominalCodeNameCredit, nominalCodeDebit, nominalCodeNameDebit;

        if (winLose === '-' && nameAndSelectionName === 'Cross accounts transfer') {
            nominalCodeCredit = '1006';
            nominalCodeNameCredit = 'Exchange Account (Master)';
            nominalCodeDebit = '1005';
            nominalCodeNameDebit = 'Exchange Account (Sub)';
        } else if (winLose === '-') {
            nominalCodeCredit = '5001';
            nominalCodeNameCredit = 'Exchange Commission';
            nominalCodeDebit = '1005';
            nominalCodeNameDebit = 'Exchange Account (Sub)';
        } else {
            nominalCodeCredit = '4000';
            nominalCodeNameCredit = 'Exchange Income';
            nominalCodeDebit = '1005';
            nominalCodeNameDebit = 'Exchange Account (Sub)';
        }

        if (creditAmount > 0) {
            journalEntries.push({
                journalNumber,
                date: formattedPlacedDate,
                description: `${betDescription} - ${nameAndSelectionName}`,
                debit: creditAmount,
                credit: 0,
                nominalCode: nominalCodeDebit,
                nominalCodeName: nominalCodeNameDebit,
                betId
            });
            journalEntries.push({
                journalNumber,
                date: formattedPlacedDate,
                description: `${betDescription} - ${nameAndSelectionName}`,
                debit: 0,
                credit: creditAmount,
                nominalCode: nominalCodeCredit,
                nominalCodeName: nominalCodeNameCredit,
                betId
            });
        } else {
            journalEntries.push({
                journalNumber,
                date: formattedPlacedDate,
                description: `${betDescription} - ${nameAndSelectionName}`,
                debit: debitAmount,
                credit: 0,
                nominalCode: nominalCodeCredit,
                nominalCodeName: nominalCodeNameCredit,
                betId
            });
            journalEntries.push({
                journalNumber,
                date: formattedPlacedDate,
                description: `${betDescription} - ${nameAndSelectionName}`,
                debit: 0,
                credit: debitAmount,
                nominalCode: nominalCodeDebit,
                nominalCodeName: nominalCodeNameDebit,
                betId
            });
        }

        journalNumber += 1;
    });

    return journalEntries;
};

const processBookieCollection = async () => {
    const journalEntries = [];
    const bookieCollection = await db.collection('bookie-statement').get();
    let journalNumber = 1;
    const excludedDocIds = ['2866509', '2866513', '2866515'];

    bookieCollection.forEach((doc) => {
        const data = doc.data();
        const description = data.description || {};
        const eventName = description.eventName || '';
        const action = data.action || '';
        const descriptionText = eventName || action;
        const date = data.date;
        const formattedDate = date ? convertUnixToDate(date) : '';
        const docId = doc.id;
        const pnl = data.pnl;
        const commission = cleanAmount(data.commission !== undefined ? data.commission : 0.0);

        if (commission !== null && commission !== 0 && action !== 'SETTLE_COMM_ADJ') {
            const totalAmount = pnl + commission;
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: 0,
                credit: totalAmount,
                nominalCode: '4001',
                nominalCodeName: 'Bookie Income',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: commission,
                credit: 0,
                nominalCode: '5004',
                nominalCodeName: 'Bookie Commission',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: pnl,
                credit: 0,
                nominalCode: '1001',
                nominalCodeName: 'Bookie Account',
                betId: docId
            });
        } else if (commission !== null && commission !== 0 && action === 'SETTLE_COMM_ADJ' && pnl <= 0) {
            const creditAmount = Math.abs(pnl);
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: 0,
                credit: creditAmount,
                nominalCode: '1001',
                nominalCodeName: 'Bookie Account',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: creditAmount,
                credit: 0,
                nominalCode: '5004',
                nominalCodeName: 'Bookie Commission',
                betId: docId
            });
        } else if (action === 'CREDIT' && pnl > 0 && !excludedDocIds.includes(docId)) {
            const bookieAmountCredit = pnl;
            const digitalWalletAmount = pnl / 3;
            const bookieIncomeAmount = (pnl * 2) / 3;
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: bookieAmountCredit,
                credit: 0,
                nominalCode: '1001',
                nominalCodeName: 'Bookie Account',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: 0,
                credit: bookieIncomeAmount,
                nominalCode: '4002',
                nominalCodeName: 'Bookie Bonus',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: 0,
                credit: digitalWalletAmount,
                nominalCode: '1000',
                nominalCodeName: 'Digital Wallet (...79DAE)',
                betId: docId
            });
        } else {
            let nominalCodeCredit, nominalCodeNameCredit, nominalCodeDebit, nominalCodeNameDebit;
            let creditAmount, debitAmount;

            if (pnl < 0.0) {
                nominalCodeCredit = '1001';
                nominalCodeNameCredit = 'Bookie Account';
                nominalCodeDebit = '5000';
                nominalCodeNameDebit = 'Bookie Stake Cost';
                creditAmount = Math.abs(pnl);
                debitAmount = Math.abs(pnl);
            } else {
                nominalCodeCredit = '4001';
                nominalCodeNameCredit = 'Bookie Income';
                nominalCodeDebit = '1001';
                nominalCodeNameDebit = 'Bookie Account';
                creditAmount = Math.abs(pnl);
                debitAmount = Math.abs(pnl);
            }

            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: debitAmount,
                credit: 0,
                nominalCode: nominalCodeDebit,
                nominalCodeName: nominalCodeNameDebit,
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: formattedDate,
                description: descriptionText,
                debit: 0,
                credit: creditAmount,
                nominalCode: nominalCodeCredit,
                nominalCodeName: nominalCodeNameCredit,
                betId: docId
            });
        }

        journalNumber += 1;
    });

    return journalEntries;
};

const retrieveAndFormatFromFirestore = async (collectionName) => {
    const data = [];
    const docs = await db.collection(collectionName).get();

    docs.forEach((doc) => {
        const docData = doc.data();
        docData.records.forEach((record) => {
            data.push({
                journalNumber: record.Jrnl_No,
                date: record.Date,
                description: record.Description,
                debit: record.DR,
                credit: record.CR,
                nominalCode: record['Nominal code'],
                nominalCodeName: record['Nominal Name'],
                exRef: record.Ex_Ref
            });
        });
    });

    return data;
};

const combineJournalEntries = async () => {
    const betfairEntries = await processBetfairCollection();
    const bookieEntries = await processBookieCollection();
    const accountTransfers = await retrieveAndFormatFromFirestore('account-transfers');

    const combinedEntries = [...betfairEntries, ...bookieEntries, ...accountTransfers];

    const trialBalance = combinedEntries.reduce((acc, entry) => {
        const code = entry.nominalCode;
        if (!acc[code]) {
            acc[code] = {
                nominalCode: code,
                nominalCodeName: entry.nominalCodeName,
                debit: 0,
                credit: 0,
                type: code < 4000 ? 'B/S' : 'P&L'
            };
        }
        acc[code].debit += entry.debit;
        acc[code].credit += entry.credit;
        return acc;
    }, {});

    const trialBalanceArray = Object.values(trialBalance).map((entry) => ({
        nominalCode: entry.nominalCode,
        nominalCodeName: entry.nominalCodeName,
        debit: entry.debit,
        credit: entry.credit,
        netEffect: entry.debit - entry.credit,
        type: entry.type
    }));

    return trialBalanceArray;
};

exports.getTrialBalance = functions.https.onCall(async (data, context) => {
    try {
        const trialBalance = await combineJournalEntries();
        return { trialBalance };
    } catch (error) {
        console.error('Error generating trial balance:', error);
        throw new functions.https.HttpsError('internal', 'Unable to generate trial balance');
    }
});
