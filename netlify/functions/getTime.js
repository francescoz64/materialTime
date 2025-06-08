const { utcToZonedTime, format } = require('date-fns-tz');
const { getUnixTime } = require('date-fns');

module.exports.handler = async function(event, context) {
  let timezoneIdentifier = (event.queryStringParameters && event.queryStringParameters.tz) || 'UTC';
  if (typeof timezoneIdentifier !== 'string' || timezoneIdentifier.trim() === '') {
    timezoneIdentifier = 'UTC';
  }

  try {
    const nowUtc = new Date();
    const nowInTimezone = utcToZonedTime(nowUtc, timezoneIdentifier);
    const formattedDateTime = format(nowInTimezone, 'yyyy-MM-dd HH:mm:ss', {
      timeZone: timezoneIdentifier,
    });

    const response = {
      success: true,
      datetime: formattedDateTime,
      timezone_used: timezoneIdentifier,
    };

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response),
    };

  } catch (error) {
    let statusCode = 500;
    let errorCode = 'PROCESSING_ERROR';
    let errorMessage = 'An error occurred while processing the time request.';

    if (error instanceof RangeError && error.message.includes('Invalid time zone')) {
      statusCode = 400;
      errorCode = 'INVALID_TIMEZONE';
      errorMessage = `Invalid or unsupported timezone identifier provided: ${timezoneIdentifier}`;
    } else {
      console.error("Time API Error:", error);
    }
    
    const errorResponse = {
      success: false,
      error_code: errorCode,
      message: errorMessage,
      requested_tz: timezoneIdentifier,
    };

    return {
      statusCode: statusCode,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(errorResponse),
    };
  }
};