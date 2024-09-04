import React from 'react';
import '../App.css'; // Use the same CSS file as the App component

const DataSummary = ({
    bookieCount,
    betfairCount,
    betListCount,
    matchedEventsCount,
    betfairBetListCount,
    bookieBalance,
    betfairBalance
}) => {
    // Function to format numbers to two decimal places
    const formatNumber = (num) => {
        return num ? num.toFixed(2) : '0.00';
    };

    return (
        <div className="data-summary">
            <table>
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Bookie Count</td>
                        <td>{bookieCount}</td>
                    </tr>
                    <tr>
                        <td>Betfair Count</td>
                        <td>{betfairCount}</td>
                    </tr>
                    <tr>
                        <td>Bet List Count</td>
                        <td>{betListCount}</td>
                    </tr>
                    <tr>
                        <td>Matched Events Count</td>
                        <td>{matchedEventsCount}</td>
                    </tr>
                    <tr>
                        <td>Betfair Bet List Count</td>
                        <td>{betfairBetListCount}</td>
                    </tr>
                    <tr>
                        <td>Bookie Balance</td>
                        <td>{formatNumber(bookieBalance)}</td>
                    </tr>
                    <tr>
                        <td>Betfair Balance</td>
                        <td>{formatNumber(betfairBalance)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default DataSummary;
