const {getBettingData} = require('./getBettingData');
const {getEventDetails} = require('./getEventDetails');
const {getTrialBalance} = require('./getTrialBalance');
const {getLatestBetfairEvent} = require('./getLatestBetfairEvent');
const {fetchEventData} = require('./fetchEventData');
const {notifyOnLatestBetfairEventUpdate} = require('./notifyOnLatestBetfairEventUpdate');
const {fetchEventData_V2} = require('./fetchEventData_V2');
const {manualMatchEvents} = require('./manualMatchEvents');
const {getTrialBalance_V2} = require('./getTrialBalance_V2');


exports.getBettingData = getBettingData;
exports.getEventDetails = getEventDetails;
exports.fetchEventData_V2 = fetchEventData_V2;
exports.getTrialBalance = getTrialBalance;
exports.getLatestBetfairEvent = getLatestBetfairEvent;
exports.fetchEventData = fetchEventData;
exports.notifyOnLatestBetfairEventUpdate = notifyOnLatestBetfairEventUpdate;
exports.manualMatchEvents = manualMatchEvents;
exports.getTrialBalance_V2 = getTrialBalance_V2;
