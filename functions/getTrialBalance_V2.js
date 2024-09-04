const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

// Utility Functions

// Function to clean up and parse amounts to ensure they are numeric and positive
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

// Function to parse a date string in the format YYYY-MM-DD into a Date object (in UTC)
const parseDate = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
};

// Function to parse a date string in the format DD/MM/YY into a Date object (in UTC)
const parseDateDDMMYY = (dateString) => {
    const [day, month, year] = dateString.split('/').map(Number);
    return new Date(Date.UTC(2000 + year, month - 1, day)); // Assuming the year is provided in two digits
};

// Function to normalize dates to ensure comparisons are consistent (date-only, no time)
const normalizeDate = (date) => {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

// Function to convert a Unix timestamp to a normalized Date object
const convertUnixToDate = (unixTimestamp) => {
    const date = new Date(unixTimestamp);
    return normalizeDate(date);
};

// Function to process 'betfair-statement' collection
const processBetfairCollection = async (startDate, endDate) => {
    const journalEntries = [];
    const betfairCollection = await db.collection('betfair-statement').get();
    let journalNumber = 1;

    betfairCollection.forEach((doc) => {
        const data = doc.data();
        const formattedPlacedDate = data.formattedPlacedDate;
        const entryDate = normalizeDate(new Date(formattedPlacedDate));

        // Filter by date range
        if (entryDate < normalizeDate(startDate) || entryDate > normalizeDate(endDate)) {
            return;
        }

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

// Function to process 'bookie-statement' collection
const processBookieCollection = async (startDate, endDate) => {
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
        const entryDate = convertUnixToDate(data.date);
        const docId = doc.id;
        const pnl = data.pnl;
        const commission = cleanAmount(data.commission !== undefined ? data.commission : 0.0);

        // Filter by date range
        if (entryDate < normalizeDate(startDate) || entryDate > normalizeDate(endDate)) {
            return;
        }

        if (commission !== null && commission !== 0 && action !== 'SETTLE_COMM_ADJ') {
            const totalAmount = pnl + commission;
            journalEntries.push({
                journalNumber,
                date: entryDate.toISOString().split('T')[0],
                description: descriptionText,
                debit: 0,
                credit: totalAmount,
                nominalCode: '4001',
                nominalCodeName: 'Bookie Income',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: entryDate.toISOString().split('T')[0],
                description: descriptionText,
                debit: commission,
                credit: 0,
                nominalCode: '5004',
                nominalCodeName: 'Bookie Commission',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: entryDate.toISOString().split('T')[0],
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
                date: entryDate.toISOString().split('T')[0],
                description: descriptionText,
                debit: 0,
                credit: creditAmount,
                nominalCode: '1001',
                nominalCodeName: 'Bookie Account',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: entryDate.toISOString().split('T')[0],
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
                date: entryDate.toISOString().split('T')[0],
                description: descriptionText,
                debit: bookieAmountCredit,
                credit: 0,
                nominalCode: '1001',
                nominalCodeName: 'Bookie Account',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: entryDate.toISOString().split('T')[0],
                description: descriptionText,
                debit: 0,
                credit: bookieIncomeAmount,
                nominalCode: '4002',
                nominalCodeName: 'Bookie Bonus',
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: entryDate.toISOString().split('T')[0],
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
                date: entryDate.toISOString().split('T')[0],
                description: descriptionText,
                debit: debitAmount,
                credit: 0,
                nominalCode: nominalCodeDebit,
                nominalCodeName: nominalCodeNameDebit,
                betId: docId
            });
            journalEntries.push({
                journalNumber,
                date: entryDate.toISOString().split('T')[0],
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

// Function to retrieve and format data from 'account-transfers' collection
const retrieveAndFormatFromFirestore = async (collectionName, startDate, endDate) => {
    const data = [];
    const docs = await db.collection(collectionName).get();

    docs.forEach((doc) => {
        const docData = doc.data();
        docData.records.forEach((record) => {
            const entryDate = normalizeDate(parseDateDDMMYY(record.Date));

            // Filter by date range
            if (entryDate < normalizeDate(startDate) || entryDate > normalizeDate(endDate)) {
                return;
            }

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

// Function to combine and calculate journal entries and trial balance
const combineJournalEntries = async (startDate, endDate) => {
    const betfairEntries = await processBetfairCollection(startDate, endDate);
    const bookieEntries = await processBookieCollection(startDate, endDate);
    const accountTransfers = await retrieveAndFormatFromFirestore('account-transfers', startDate, endDate);

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
        debit: parseFloat(entry.debit.toFixed(2)),
        credit: parseFloat(entry.credit.toFixed(2)),
        netEffect: parseFloat((entry.debit - entry.credit).toFixed(2)),
        type: entry.type
    }));

    // Calculate the summary
    const summary = {
        totalDebit: 0,
        totalCredit: 0,
        netEffect: 0,
        totalDebitPL: 0,
        totalCreditPL: 0,
        netEffectPL: 0,
        totalDebitBS: 0,
        totalCreditBS: 0,
        netEffectBS: 0,
    };

    trialBalanceArray.forEach((entry) => {
        summary.totalDebit += entry.debit;
        summary.totalCredit += entry.credit;
        summary.netEffect += entry.netEffect;

        if (entry.type === 'P&L') {
            summary.totalDebitPL += entry.debit;
            summary.totalCreditPL += entry.credit;
            summary.netEffectPL += entry.netEffect;
        } else if (entry.type === 'B/S') {
            summary.totalDebitBS += entry.debit;
            summary.totalCreditBS += entry.credit;
            summary.netEffectBS += entry.netEffect;
        }
    });

    // Round summary values to 2 decimal places
    summary.totalDebit = parseFloat(summary.totalDebit.toFixed(2));
    summary.totalCredit = parseFloat(summary.totalCredit.toFixed(2));
    summary.netEffect = parseFloat(summary.netEffect.toFixed(2));

    summary.totalDebitPL = parseFloat(summary.totalDebitPL.toFixed(2));
    summary.totalCreditPL = parseFloat(summary.totalCreditPL.toFixed(2));
    summary.netEffectPL = parseFloat(summary.netEffectPL.toFixed(2));

    summary.totalDebitBS = parseFloat(summary.totalDebitBS.toFixed(2));
    summary.totalCreditBS = parseFloat(summary.totalCreditBS.toFixed(2));
    summary.netEffectBS = parseFloat(summary.netEffectBS.toFixed(2));

    return { trialBalanceArray, summary };
};

// Cloud Function to generate trial balance
exports.getTrialBalance_V2 = functions.https.onCall(async (data, context) => {
    try {
        // Parse and validate dates from the data
        const startDate = parseDate(data.startDate);
        const endDate = parseDate(data.endDate);

        if (isNaN(startDate) || isNaN(endDate)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid start or end date');
        }

        const { trialBalanceArray, summary } = await combineJournalEntries(startDate, endDate);
        return { trialBalance: trialBalanceArray, summary };
    } catch (error) {
        console.error('Error generating trial balance:', error);
        throw new functions.https.HttpsError('internal', 'Unable to generate trial balance');
    }
});
