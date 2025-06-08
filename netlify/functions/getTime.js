// MODIFICA QUI: Usiamo la sintassi CommonJS 'require'
const { utcToZonedTime, format } = require('date-fns-tz');
const { getUnixTime } = require('date-fns');

// La funzione handler che Netlify eseguirà
// MODIFICA QUI: Esportiamo con 'module.exports'
module.exports.handler = async function(event, context) {
  
  console.log("--- Funzione getTime avviata (v3 - CommonJS) ---");

  let timezoneIdentifier = (event.queryStringParameters && event.queryStringParameters.tz) || 'UTC';
  if (typeof timezoneIdentifier !== 'string' || timezoneIdentifier.trim() === '') {
    timezoneIdentifier = 'UTC';
  }
  
  console.log(`Passo 1: Timezone richiesto: '${timezoneIdentifier}'`);

  try {
    const nowUtc = new Date();
    console.log(`Passo 2: Oggetto Date UTC creato: ${nowUtc.toISOString()}`);

    const unixTest = getUnixTime(nowUtc);
    console.log(`Passo 3: Test 'date-fns' (getUnixTime) OK. Valore: ${unixTest}`);

    // Ora proviamo a usare le funzioni importate
    const nowInTimezone = utcToZonedTime(nowUtc, timezoneIdentifier);
    console.log(`Passo 4: 'utcToZonedTime' eseguito con successo.`);

    const formattedDateTime = format(nowInTimezone, 'yyyy-MM-dd HH:mm:ss', {
      timeZone: timezoneIdentifier,
    });
    console.log(`Passo 5: Formattazione finale completata: '${formattedDateTime}'`);

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
    console.error("!!! ERRORE CATTURATO NEL BLOCCO CATCH !!!");
    console.error(`TIPO DI ERRORE: ${error.name}`);
    console.error(`MESSAGGIO DI ERRORE: ${error.message}`);
    console.error("STACK TRACE COMPLETO:", error.stack);

    let statusCode = 500;
    let errorCode = 'PROCESSING_ERROR';
    let errorMessage = 'An error occurred while processing the time request.';

    if (error instanceof RangeError && error.message.includes('Invalid time zone')) {
      statusCode = 400;
      errorCode = 'INVALID_TIMEZONE';
      errorMessage = `Invalid or unsupported timezone identifier provided: ${timezoneIdentifier}`;
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