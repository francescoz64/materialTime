// MODIFICA QUI: Importiamo l'intero pacchetto invece di singole funzioni
import * as dateFnsTz from 'date-fns-tz';
import { getUnixTime } from 'date-fns';

// La funzione handler che Netlify eseguirà
export async function handler(event, context) {
  // === INIZIO BLOCCO DI DEBUG ===
  console.log("--- Funzione getTime avviata (v2) ---");
  // ============================

  let timezoneIdentifier = event.queryStringParameters.tz || 'UTC';
  if (typeof timezoneIdentifier !== 'string' || timezoneIdentifier.trim() === '') {
    timezoneIdentifier = 'UTC';
  }
  
  console.log(`Passo 1: Timezone richiesto: '${timezoneIdentifier}'`);

  try {
    const nowUtc = new Date();
    console.log(`Passo 2: Oggetto Date UTC creato con successo: ${nowUtc.toISOString()}`);
    const unixTest = getUnixTime(nowUtc);
    console.log(`Passo 3: Test 'date-fns' (getUnixTime) OK. Valore: ${unixTest}`);

    // MODIFICA QUI: Usiamo la funzione accedendo dall'oggetto importato
    const nowInTimezone = dateFnsTz.utcToZonedTime(nowUtc, timezoneIdentifier);
    console.log(`Passo 4: 'utcToZonedTime' eseguito con successo.`);

    // MODIFICA QUI: Usiamo la funzione accedendo dall'oggetto importato
    const formattedDateTime = dateFnsTz.format(nowInTimezone, 'yyyy-MM-dd HH:mm:ss', {
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
}