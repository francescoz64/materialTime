// Usa 'import' invece di 'require'
import { utcToZonedTime, format } from 'date-fns-tz';

// Usa 'export default' per la funzione principale
export default async (req, context) => {
	
    // I parametri URL si trovano nell'oggetto URL della richiesta
    const url = new URL(req.url);
    const timezoneIdentifier = url.searchParams.get("tz") || 'UTC';
    
	
    // Il resto della logica interna rimane quasi identico
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

        // Usa 'new Response()' per restituire la risposta
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // Per CORS se necessario
            },
        });

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

        return new Response(JSON.stringify(errorResponse), {
            status: statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        });
    }
	
};