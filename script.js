/*
    SCRIPT.JS PER MATERIALTIME - ARCHITETTURA LONG POLLING
    ======================================================
    Versione: 2.5 (Stabile, Robusta, Commentata)
    - Comunicazione asincrona con l'ESP32 mediata da un backend serverless.
    - Gestione degli stati UI semplificata per maggiore robustezza.
    - Funzionalità di configurazione (Timezone, 12/24h, ecc.) e comandi di servizio.
*/
document.addEventListener('DOMContentLoaded', () => {
    
	let isSubmitting = false; // Variabile di blocco globale
	let isRefreshing = false;
	
    // --- STATI APPLICAZIONE ---
    // Definisce i tre stati fondamentali dell'applicazione.
    // Questa macchina a stati semplificata governa l'abilitazione/disabilitazione dell'intera UI.
    const APP_STATES = {
		INITIALIZING: 'INITIALIZING', // Stato iniziale: in attesa di sessione e primo contatto con l'orologio. UI bloccata.
		CONFIGURING: 'CONFIGURING',   // Stato operativo: l'app è pronta e l'utente può interagire. UI sbloccata.
		ERROR: 'ERROR'                // Stato di errore: qualcosa è andato storto (es. no sessionID) e l'app non può continuare.
	};
	let currentAppState = APP_STATES.INITIALIZING;
	let sessionId = null;
	let responsePollController = null; // Oggetto per poter annullare le richieste di polling in corso.
	let lastReceivedClockStatus = null; // Memorizza l'ultimo stato valido ricevuto dall'orologio.
                                        

    // --- ELENCO TIMEZONE CURATO ---
    // Un elenco predefinito di timezone comuni per popolare il <select> nel form.
    const timezonesForSelect = [
        // Riferimento Globale
        { value: "UTC", text: "Coordinated Universal Time (UTC)" },

        // --- EUROPA ---
        { value: "Europe/London",      text: "(GMT+00:00) Londra, Dublino, Lisbona" },
        { value: "Europe/Madrid",      text: "(GMT+01:00) Madrid" },
        { value: "Europe/Paris",       text: "(GMT+01:00) Parigi, Bruxelles, Amsterdam" },
        { value: "Europe/Rome",        text: "(GMT+01:00) Roma" },
        { value: "Europe/Berlin",      text: "(GMT+01:00) Berlino, Zurigo, Vienna" },
        { value: "Europe/Stockholm",   text: "(GMT+01:00) Stoccolma, Oslo, Copenaghen" },
        { value: "Europe/Athens",      text: "(GMT+02:00) Atene, Bucarest, Helsinki" },
        { value: "Europe/Istanbul",    text: "(GMT+03:00) Istanbul" },
        { value: "Europe/Moscow",      text: "(GMT+03:00) Mosca, San Pietroburgo" },

        // --- AMERICHE ---
        { value: "America/New_York",   text: "(GMT-05:00) Nord America - Eastern Time (New York)" },
        { value: "America/Chicago",    text: "(GMT-06:00) Nord America - Central Time (Chicago)" },
        { value: "America/Denver",     text: "(GMT-07:00) Nord America - Mountain Time (Denver)" },
        { value: "America/Phoenix",    text: "(GMT-07:00) Nord America - Mountain Time (Phoenix, No-DST)" },
        { value: "America/Los_Angeles",text: "(GMT-08:00) Nord America - Pacific Time (Los Angeles)" },
        { value: "America/Anchorage",  text: "(GMT-09:00) Nord America - Alaska Time (Anchorage)" },
        { value: "Pacific/Honolulu",   text: "(GMT-10:00) Nord America - Hawaii Time (Honolulu, No-DST)" },
        { value: "America/Sao_Paulo",  text: "(GMT-03:00) Sud America - San Paolo, Brasilia" },
        { value: "America/Buenos_Aires",text: "(GMT-03:00) Sud America - Buenos Aires" },
        { value: "America/Santiago",   text: "(GMT-04:00) Sud America - Santiago del Cile" },
        { value: "America/Bogota",     text: "(GMT-05:00) Sud America - Bogotà, Lima (No-DST)" },
        
        // --- ASIA E PACIFICO/OCEANIA ---
        { value: "Asia/Dubai",         text: "(GMT+04:00) Dubai, Abu Dhabi" },
        { value: "Asia/Karachi",       text: "(GMT+05:00) Karachi, Tashkent" },
        { value: "Asia/Kolkata",       text: "(GMT+05:30) India Standard Time (Mumbai, Nuova Delhi)" },
        { value: "Asia/Bangkok",       text: "(GMT+07:00) Bangkok, Giacarta, Hanoi" },
        { value: "Asia/Singapore",     text: "(GMT+08:00) Singapore, Hong Kong, Pechino" },
        { value: "Asia/Shanghai",      text: "(GMT+08:00) Shanghai" },
        { value: "Asia/Tokyo",         text: "(GMT+09:00) Tokyo, Seoul" },
        { value: "Australia/Perth",    text: "(GMT+08:00) Australia - Western Time (Perth, No-DST)" },
        { value: "Australia/Darwin",   text: "(GMT+09:30) Australia - Central Time (Darwin, No-DST)" },
        { value: "Australia/Adelaide", text: "(GMT+09:30) Australia - Central Time (Adelaide)" },
        { value: "Australia/Brisbane", text: "(GMT+10:00) Australia - Eastern Time (Brisbane, No-DST)" },
        { value: "Australia/Sydney",   text: "(GMT+10:00) Australia - Eastern Time (Sydney, Melbourne)" },
        { value: "Pacific/Auckland",   text: "(GMT+12:00) Auckland, Nuova Zelanda" },
        
        // --- AFRICA E MEDIO ORIENTE ---
        { value: "Asia/Tel_Aviv",      text: "(GMT+02:00) Tel Aviv, Gerusalemme" },
        { value: "Africa/Cairo",       text: "(GMT+02:00) Cairo" },
        { value: "Africa/Johannesburg",text: "(GMT+02:00) Johannesburg" },
        { value: "Asia/Riyadh",        text: "(GMT+03:00) Riyadh, Kuwait, Qatar" },
        { value: "Africa/Nairobi",     text: "(GMT+03:00) Nairobi, Africa Orientale" },
        { value: "Africa/Lagos",       text: "(GMT+01:00) Lagos, Africa Occidentale" },

    ];
	
    // --- ELEMENTI UI PRINCIPALI ---
    // Riferimenti agli elementi DOM per una facile manipolazione.
    const alertPlaceholder = document.getElementById('alert-placeholder');
    const mainContent = document.querySelector('.container.mt-4');
    const initialOverlay = document.getElementById('initial-overlay');
    const initialOverlayMessage = document.getElementById('initial-overlay-message');
    const initialOverlaySpinner = document.getElementById('initial-overlay-spinner');

    const refreshStatusBtn = document.getElementById('refresh-status-btn');
    const currentClockTimeEl = document.getElementById('current-clock-time');
    const currentFormat12hEl = document.getElementById('current-format12h');
    const currentAlwaysOnEl = document.getElementById('current-alwaysOn');
    const currentOpModeEl = document.getElementById('current-op-mode');
    const currentClockTimezoneEl = document.getElementById('current-clock-timezone');
    const lastStatusTimestampEl = document.getElementById('last-status-timestamp');

    const configForm = document.getElementById('config-form');
    const format12hSwitch = document.getElementById('format12h');
    const alwaysOnSwitch = document.getElementById('alwaysOn');
    const timezoneInput = document.getElementById('timezone');
    const serviceCommandRadios = document.querySelectorAll('input[name="serviceCommand"]');
    const submitConfigBtn = configForm ? configForm.querySelector('button[type="submit"]') : null;

    const confirmSubmitModalEl = document.getElementById('confirmSubmitModal');
    let confirmSubmitModal = confirmSubmitModalEl ? new bootstrap.Modal(confirmSubmitModalEl) : null;
    const modalDynamicMessageArea = document.getElementById('modal-dynamic-message-area');
    const proceedWithSubmitBtn = document.getElementById('proceedWithSubmitBtn');
    const modalCloseButton = document.getElementById('modalCloseButton');
    const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');

    const resetWifiCredentialsBtn = document.getElementById('resetWifiCredentialsBtn');
    const confirmResetWifiModalEl = document.getElementById('confirmResetWifiModal');
    let confirmResetWifiModal = confirmResetWifiModalEl ? new bootstrap.Modal(confirmResetWifiModalEl) : null;
    const proceedWithWifiResetBtn = document.getElementById('proceedWithWifiResetBtn');
    const cancelResetWifiBtn = document.getElementById('cancelResetWifiBtn');
    const closeResetWifiModalBtn = document.getElementById('closeResetWifiModalBtn');

    if (document.getElementById('current-year')) {
        document.getElementById('current-year').textContent = new Date().getFullYear();
    }

// ******************************************************
// GRUPPO: FUNZIONI DI COMUNICAZIONE CON IL BACKEND (API LAYER)
// Questo gruppo astrae tutta la comunicazione di rete. Le altre parti dell'app
// non devono sapere come avviene la comunicazione, ma solo chiamare queste funzioni.
// ******************************************************

    /**
     * Invia un comando generico al backend serverless.
     * Questa è l'unica funzione usata per mandare dati VERSO l'orologio.
     * @param {string} command - Il nome del comando (es. 'GET_STATE', 'SET_CONFIG').
     * @param {object} payload - Un oggetto JSON con i dati aggiuntivi per il comando.
     * @returns {Promise<boolean>} - True se il server ha accettato il comando (HTTP 200), false altrimenti.
     */
	async function sendCommandToServer(command, payload = {}) {
		if (!sessionId) {
			showAlert("Errore: ID di sessione non valido.", 'danger');
			return false;
		}
		console.log(`Sending command '${command}' to server...`, payload);
		try {
			const response = await fetch('/.netlify/functions/sendCommand', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId, command, payload })
			});
			return response.ok;
		} catch (error) {
			showAlert(`Errore di comunicazione di rete: ${error.message}`, 'danger');
			return false;
		}
	}
	
    /**
     * Avvia un ciclo di Long Polling per ricevere risposte/eventi dall'orologio.
     * Questa funzione rimane attiva in background per tutta la durata della sessione,
     * mantenendo un canale di comunicazione aperto DALL'orologio VERSO la webapp.
     */
	async function startPollingForResponses() {
		if (responsePollController) responsePollController.abort();
		responsePollController = new AbortController();
		const signal = responsePollController.signal;

		console.log("Inizio polling per le risposte del dispositivo...");

		while (!signal.aborted) {
			try {
				const response = await fetch(`/.netlify/functions/pollForResponse?session_id=${sessionId}`, { signal });
				if (signal.aborted) break;

				if (response.status === 200) {
					const data = await response.json();
					if (data.type === 'STATE_UPDATE') {
						console.log("Ricevuto aggiornamento di stato dal dispositivo:", data.payload);
						handleClockData(data.payload);
					} else if (data.type === 'ACK') {
						console.log("Ricevuto ACK dal dispositivo per il comando:", data.command);
						showAlert(`Comando confermato con successo dall'orologio!`, 'success');
					} else if (data.type === 'NACK') {
						 showAlert(`L'orologio ha risposto con un errore (NACK). Controllare i log del dispositivo.`, 'warning');
					}
				} else if (response.status !== 204) {
					throw new Error(`Stato server inatteso: ${response.status}`);
				}
			} catch (error) {
				if (!signal.aborted) {
					setAppState(APP_STATES.ERROR);
					showAlert("Connessione con l'orologio interrotta. Ricaricare la pagina.", 'danger');
					responsePollController.abort();
				}
			}
		}
	}	
		
// ******************************************************
// GRUPPO: FUNZIONI DI GESTIONE DELLA UI (UI LAYER)
// Questo gruppo contiene le funzioni che manipolano direttamente il DOM.
// ******************************************************
  
    /**
     * Contatta il backend per ottenere l'ora corrente precisa per un dato timezone.
     * Usato per sincronizzare l'ora prima di inviare una nuova configurazione.
     * @param {string} timezone - Il timezone desiderato (es. "Europe/Rome").
     * @returns {Promise<string|null>} - La stringa datetime o null in caso di errore.
     */
    async function fetchCurrentTimeFromServer(timezone) {
        const serverUrl = `/.netlify/functions/getTime?tz=${encodeURIComponent(timezone)}`;
        console.log(`Richiesta ora corrente al server Netlify per timezone: ${timezone}`);
        try {
            const response = await fetch(serverUrl, { signal: AbortSignal.timeout(8000) }); 
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Errore sconosciuto dal server dell\'ora.');
            }
            const timeData = await response.json();
            if (timeData.success) {
                return timeData.datetime;
            } else {
                throw new Error(timeData.message || 'Il server ha restituito un errore.');
            }
        } catch (error) {
            console.error("Errore nel fetch dell'ora:", error);
            showAlert(`Impossibile sincronizzare l'ora dal server: ${error.message}`, 'danger');
            return null;
        }
    }
	
    /**
     * Funzione centrale per gestire lo stato visuale dell'applicazione.
     * Abilita/disabilita l'intera UI in base allo stato corrente.
     * @param {string} newState - Il nuovo stato da applicare (da APP_STATES).
     */
	function setAppState(newState) {
		console.log("Cambio stato app:", currentAppState, "->", newState);
		currentAppState = newState;

		const isInitializing = newState === APP_STATES.INITIALIZING;
		const isError = newState === APP_STATES.ERROR;

		if (initialOverlay) initialOverlay.classList.toggle('d-none', !isInitializing && !isError);
		if (mainContent) mainContent.classList.toggle('d-none', isInitializing || isError);

		const isConfigurable = newState === APP_STATES.CONFIGURING;
		if (configForm) {
			Array.from(configForm.elements).forEach(el => el.disabled = !isConfigurable);
		}
		if (refreshStatusBtn) refreshStatusBtn.disabled = !isConfigurable;
		if (resetWifiCredentialsBtn) resetWifiCredentialsBtn.disabled = !isConfigurable;
	}
		
    /**
     * Gestisce la visualizzazione di uno spinner su un pulsante per dare feedback visivo
     * durante un'operazione asincrona.
     * @param {HTMLElement} buttonElement - L'elemento bottone.
     * @param {boolean} show - True per mostrare lo spinner, false per nasconderlo.
     * @param {string} spinnerText - Il testo da mostrare accanto allo spinner.
     */
    function showButtonSpinner(buttonElement, show = true, spinnerText = "Attendere...") {
        if (!buttonElement) return;
        if (show) {
            if (!buttonElement.dataset.originalContent) {
                buttonElement.dataset.originalContent = buttonElement.innerHTML;
            }
            buttonElement.disabled = true;
            buttonElement.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${spinnerText}`;
        } else {
            buttonElement.disabled = false;
            if (buttonElement.dataset.originalContent) {
                buttonElement.innerHTML = buttonElement.dataset.originalContent;
            }
        }
    }
    
    /**
     * Popola il menu a tendina (<select>) dei timezone.
     */
    function populateTimezoneSelect() {
        if (timezoneInput && timezoneInput.tagName === 'SELECT') {
            timezoneInput.innerHTML = '';
            timezonesForSelect.forEach(tz => {
                const option = document.createElement('option');
                option.value = tz.value;
                option.textContent = tz.text;
                timezoneInput.appendChild(option);
            });
            console.log("Select dei timezone popolato.");
        }
    }

    /**
     * Aggiorna i campi di testo della sezione "Stato Attuale" con i dati ricevuti.
     * @param {object|null} statusData - L'oggetto con lo stato o null per pulire i campi.
     */
    function populateStatusFields(statusData) {
        lastReceivedClockStatus = statusData;
        if (statusData) {
            if(currentClockTimeEl) currentClockTimeEl.textContent = formatDateTimeForDisplay(statusData.datetime);
            if(currentFormat12hEl) currentFormat12hEl.textContent = statusData.format12h ? '12 Ore (AM/PM)' : '24 Ore';
            if(currentAlwaysOnEl) currentAlwaysOnEl.textContent = statusData.alwaysOn ? 'Sì' : 'No';
            if(currentClockTimezoneEl) currentClockTimezoneEl.textContent = statusData.timezone || "N/D";
            if(currentOpModeEl) {
                if (statusData.allIN === true) currentOpModeEl.textContent = 'ALL IN';
                else if (statusData.allOUT === true) currentOpModeEl.textContent = 'ALL OUT';
                else currentOpModeEl.textContent = 'Time Mode';
            }
            if(lastStatusTimestampEl) lastStatusTimestampEl.textContent = new Date().toLocaleString('it-IT') + " (dati ricevuti ora)";
        } else {
            if(currentClockTimeEl) currentClockTimeEl.textContent = "N/D";
            if(currentFormat12hEl) currentFormat12hEl.textContent = "N/D";
            if(currentAlwaysOnEl) currentAlwaysOnEl.textContent = "N/D";
            if(currentOpModeEl) currentOpModeEl.textContent = "N/D";
            if(currentClockTimezoneEl) currentClockTimezoneEl.textContent = "N/D";
            if(lastStatusTimestampEl) lastStatusTimestampEl.textContent = 'Mai';
        }
    }

    /**
     * Aggiorna i valori del form di configurazione (switch, select, radio) in base ai dati ricevuti.
     * @param {object|null} statusData - L'oggetto con lo stato o null per impostare i default.
     */
    function populateFormFields(statusData) {
        if (statusData) {
            if(format12hSwitch) format12hSwitch.checked = !!statusData.format12h;
            if(alwaysOnSwitch) alwaysOnSwitch.checked = !!statusData.alwaysOn;
            if(timezoneInput && timezoneInput.tagName === 'SELECT') {
                timezoneInput.value = statusData.timezone || "Europe/Rome";
                if (!timezonesForSelect.some(tz => tz.value === timezoneInput.value)) {
                    console.warn(`Timezone "${statusData.timezone}" non trovato nell'elenco. Imposto default "Europe/Rome".`);
                    timezoneInput.value = "Europe/Rome"; 
                }
            }
            const cmdAllIN = document.getElementById('cmd-allIN');
            const cmdAllOUT = document.getElementById('cmd-allOUT');
            const cmdTimeMode = document.getElementById('cmd-timeMode') || document.getElementById('cmd-none');
            if (statusData.allIN === true && cmdAllIN) cmdAllIN.checked = true;
            else if (statusData.allOUT === true && cmdAllOUT) cmdAllOUT.checked = true;
            else if (cmdTimeMode) cmdTimeMode.checked = true;
        } else {
            if(format12hSwitch) format12hSwitch.checked = false;
            if(alwaysOnSwitch) alwaysOnSwitch.checked = false;
            if(timezoneInput) timezoneInput.value = "Europe/Rome";
            const cmdTimeMode = document.getElementById('cmd-timeMode') || document.getElementById('cmd-none');
            if(cmdTimeMode) cmdTimeMode.checked = true;
        }
    }

    /**
     * Mostra un alert Bootstrap dinamico nell'apposito placeholder.
     * @param {string} message - Il messaggio da visualizzare.
     * @param {string} type - Il tipo di alert (es. 'success', 'danger', 'info').
     * @param {number} duration - La durata in ms prima che l'alert scompaia.
     * @param {boolean} dismissible - Se l'utente può chiudere l'alert.
     */
    function showAlert(message, type = 'info', duration = 7000, dismissible = true) {
        if (!alertPlaceholder) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = [
            `<div class="alert alert-${type} alert-dismissible fade show" role="alert">`,
            `   <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : type === 'danger' ? 'bi-exclamation-triangle-fill' : type === 'warning' ? 'bi-exclamation-diamond-fill' : 'bi-info-circle-fill'} me-2"></i>`,
            `   ${message}`,
            dismissible ? '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>' : '',
            '</div>'
        ].join('');
        alertPlaceholder.append(wrapper);
        if (duration && dismissible) {
            setTimeout(() => {
                if (wrapper.parentNode) {
                    wrapper.remove();
                }
            }, duration);
        }
    }

    /**
     * Formatta una stringa datetime dal formato "YYYY-MM-DD HH:MM:SS" a un formato più leggibile.
     * @param {string} dateTimeString - La stringa da formattare.
     * @returns {string} - La stringa formattata o un messaggio di errore/default.
     */
    function formatDateTimeForDisplay(dateTimeString) {
        if (!dateTimeString || dateTimeString === "0000-00-00 00:00:00") return "N/D (ora non impostata/sincronizzata)";
        try {
            const [datePart, timePart] = dateTimeString.split(' ');
            if (!datePart || !timePart) return dateTimeString;
            const [year, month, day] = datePart.split('-');
            if (parseInt(year,10) < 2023 && datePart !== "0000-00-00") return "N/D (segnale orologio anomalo)";
            return `${timePart} (${day}/${month}/${year})`;
        } catch (e) { 
            console.warn("Errore formattazione datetime:", dateTimeString, e);
            return dateTimeString;
        }
    }

// ******************************************************
// GRUPPO: FUNZIONI DI LOGICA APPLICATIVA (BUSINESS LOGIC)
// Questo gruppo orchestra il flusso principale dell'applicazione.
// ******************************************************

    /**
     * Funzione chiave che processa i dati di stato ricevuti dall'orologio.
     * Aggiorna la UI e, se è la prima ricezione, sblocca l'applicazione.
     * @param {object} data - L'oggetto JSON con lo stato dell'orologio.
     */
 	function handleClockData(data) {
		console.log("Processo i dati di stato ricevuti:", data);
		if (data && data.datetime !== undefined) { 
			lastReceivedClockStatus = {
				datetime: data.datetime,
				format12h: !!data.format12h,
				alwaysOn: !!data.alwaysOn,
				allIN: !!data.allIN,
				allOUT: !!data.allOUT,
				timezone: data.timezone || "Europe/Rome"
			};
			populateStatusFields(lastReceivedClockStatus);
			populateFormFields(lastReceivedClockStatus);
			if (currentAppState === APP_STATES.INITIALIZING) {
				showAlert('Stato dell\'orologio caricato. Pronto per la configurazione.', 'success');
				setAppState(APP_STATES.CONFIGURING);
			}
		} else {
			showAlert("Dati ricevuti dall'orologio non validi o incompleti.", 'warning');
			if (currentAppState === APP_STATES.INITIALIZING) {
				 setAppState(APP_STATES.ERROR);
				 if (initialOverlayMessage) initialOverlayMessage.textContent = "Impossibile caricare lo stato iniziale dall'orologio.";
			}
		}
	}
   
	/*
     * Punto di ingresso dell'applicazione.
     * Avvia la comunicazione e attende pazientemente la prima risposta di stato.
     */
    async function initializeApp() {
        populateTimezoneSelect();
        const urlParams = new URLSearchParams(window.location.search);
        sessionId = urlParams.get('session_id');

        if (!sessionId) {
            setAppState(APP_STATES.ERROR);
            if (initialOverlayMessage) initialOverlayMessage.textContent = "Errore: ID di sessione non trovato.";
            if (initialOverlaySpinner) initialOverlaySpinner.style.display = 'none';
            return;
        }

        console.log("App inizializzata con ID di sessione:", sessionId);
        setAppState(APP_STATES.INITIALIZING);
        if (initialOverlayMessage) initialOverlayMessage.textContent = "Contatto l'orologio...";

        // Invia il comando per richiedere lo stato iniziale.
        // Non attendiamo la risposta qui, lasciamo che il polling la gestisca.
        sendCommandToServer('GET_STATE');
        
        // Avvia il ciclo di polling che riceverà lo stato e sbloccherà l'UI.
        // La funzione `handleClockData` si occuperà di cambiare lo stato da
        // INITIALIZING a CONFIGURING quando arriverà la prima risposta valida.
        startPollingForResponses();

        // Aggiungiamo un timeout di sicurezza per l'interfaccia utente.
        // Se dopo 20 secondi l'app è ancora in stato 'INITIALIZING',
        // qualcosa è andato storto e lo comunichiamo all'utente.
        setTimeout(() => {
            if (currentAppState === APP_STATES.INITIALIZING) {
                console.error("Timeout di inizializzazione: nessuna risposta di stato ricevuta.");
                setAppState(APP_STATES.ERROR);
                if (initialOverlayMessage) initialOverlayMessage.textContent = "L'orologio non risponde. Assicurati che sia acceso e in modalità Setup. Ricarica la pagina per riprovare.";
                if (initialOverlaySpinner) initialOverlaySpinner.style.display = 'none';
                if (responsePollController) responsePollController.abort(); // Ferma il polling
            }
        }, 20000); // Timeout di 20 secondi
    }
	
	
	
	
// ******************************************************
// GRUPPO: EVENT LISTENERS
// Questo blocco collega le funzioni definite sopra agli eventi del browser (click, submit, etc.).
// ******************************************************

    window.addEventListener('load', () => {
		console.log("Finestra caricata. Avvio dell'app...");
		initializeApp();
	});

    if(configForm) {
        configForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (currentAppState !== APP_STATES.CONFIGURING) {
                showAlert("Attendere il completamento dell'operazione corrente.", "warning");
                return;
            }
            let modalMessages = `<p>Stai per inviare la seguente configurazione. Verrà sincronizzata anche l'ora corrente per il timezone selezionato.</p>`;
            if(modalDynamicMessageArea) modalDynamicMessageArea.innerHTML = modalMessages;
            if (confirmSubmitModal) confirmSubmitModal.show();
        });
    }

	if (proceedWithSubmitBtn) {
		proceedWithSubmitBtn.addEventListener('click', async () => {
			if (isSubmitting) {
				console.warn("Submit già in corso, nuovo tentativo ignorato.");
				return;
			}
			isSubmitting = true; // Imposta il blocco

			if (confirmSubmitModal) confirmSubmitModal.hide();
			showButtonSpinner(submitConfigBtn, true, "Invio...");

			try { // Aggiungiamo un blocco try...finally per garantire lo sblocco
				const selectedTimezone = timezoneInput.value;
				const currentDateTime = await fetchCurrentTimeFromServer(selectedTimezone);
				
				if (currentDateTime === null) {
					showAlert("Invio annullato: impossibile sincronizzare l'ora.", "warning");
					// Nota: non facciamo return qui, lasciamo che il blocco finally pulisca
				} else {
					const selectedServiceCommandRadio = document.querySelector('input[name="serviceCommand"]:checked');
					const payload = {
						datetime: currentDateTime,
						format12h: format12hSwitch.checked,
						alwaysOn: alwaysOnSwitch.checked,
						timezone: selectedTimezone,
						allIN: (selectedServiceCommandRadio.value === 'allIN'),
						allOUT: (selectedServiceCommandRadio.value === 'allOUT')
					};

					const success = await sendCommandToServer('SET_CONFIG', payload);

					if (success) {
						showAlert("Comando di configurazione inviato. Clicca 'Aggiorna Stato' per vedere le modifiche.", "info");
					} else {
						showAlert("Errore: impossibile inviare il comando al server.", "danger");
					}
				}
			} finally {
				// Il blocco `finally` viene eseguito SEMPRE, sia che la logica
				// abbia successo, sia che fallisca o lanci un'eccezione.
				// Questo garantisce che il nostro blocco e il nostro spinner
				// vengano sempre rimossi.
				showButtonSpinner(submitConfigBtn, false); // Sblocca il pulsante
				isSubmitting = false; // Rilascia il blocco
				console.log("Submit completato, blocco rilasciato.");
			}
		});
	}
	
	

	if (refreshStatusBtn) {
			refreshStatusBtn.addEventListener('click', async () => {
				// Se un'altra operazione è in corso (il pulsante è già disabilitato), non fare nulla.
				// Questo controllo è più generico e robusto del solo `isRefreshing`.
				if (refreshStatusBtn.disabled) {
					console.warn("Operazione già in corso, ignorato doppio click su Aggiorna.");
					return;
				}

				// Avvolgiamo tutto in un try...finally per garantire lo sblocco del pulsante.
				try {
					showButtonSpinner(refreshStatusBtn, true, "Richiedo...");
					const success = await sendCommandToServer('GET_STATE');

					if (success) {
						showAlert("Richiesta di stato inviata. In attesa di risposta...", "info");
					} else {
						showAlert("Impossibile inviare la richiesta di stato al server.", "danger");
					}
				} finally {
					// Indipendentemente dal successo, sblocchiamo il pulsante dopo un breve ritardo.
					// Il ritardo è solo per evitare che lo spinner scompaia troppo in fretta,
					// ma potremmo anche rimuoverlo per la massima reattività.
					setTimeout(() => {
						showButtonSpinner(refreshStatusBtn, false);
						console.log("Pulsante Aggiorna sbloccato.");
					}, 1000); 
				}
			});
		}



    if (resetWifiCredentialsBtn) {
        resetWifiCredentialsBtn.addEventListener('click', () => {
            if (currentAppState !== APP_STATES.CONFIGURING) {
                showAlert("Attendi il completamento di altre operazioni prima di resettare il WiFi.", "warning");
                return;
            }
            showButtonSpinner(proceedWithWifiResetBtn, false);
            if(confirmResetWifiModal) confirmResetWifiModal.show();
        });
    }

	if (proceedWithWifiResetBtn) {
		proceedWithWifiResetBtn.addEventListener('click', async () => {
			showButtonSpinner(proceedWithWifiResetBtn, true, "Invio...");
			const success = await sendCommandToServer('RESET_WIFI');
			if (confirmResetWifiModal) confirmResetWifiModal.hide();
			
			if (success) {
				showAlert(
					"<strong>Comando di reset WiFi inviato!</strong><br>" +
					"materialTime si riavvierà in modalità Access Point (AP). " +
					"Questa pagina perderà la connessione. Segui le istruzioni sul dispositivo per riconfigurare la rete WiFi.",
					'success', 60000, false
				);

				if (responsePollController) responsePollController.abort();
				sessionId = null;
				lastReceivedClockStatus = null;
				populateStatusFields(null);
				populateFormFields(null);
				setAppState(APP_STATES.ERROR);
				if(initialOverlayMessage) initialOverlayMessage.textContent = "Sessione terminata. Riconfigura l'orologio e accedi di nuovo.";
				if(initialOverlaySpinner) initialOverlaySpinner.style.display = 'none';
			} else {
				showAlert("Errore: impossibile inviare il comando di reset al server.", "danger");
				setAppState(APP_STATES.CONFIGURING);
			}
			
			showButtonSpinner(proceedWithWifiResetBtn, false);
		});
	}

    if(modalCloseButton) modalCloseButton.addEventListener('click', () => { if(confirmSubmitModal) confirmSubmitModal.hide(); });
    if(cancelSubmitBtn) cancelSubmitBtn.addEventListener('click', () => { if(confirmSubmitModal) confirmSubmitModal.hide(); });
    if(confirmSubmitModalEl) {
        confirmSubmitModalEl.addEventListener('hidden.bs.modal', () => {
            if (currentAppState !== APP_STATES.CONFIGURING) {
                // Non fa nulla, lo stato verrà gestito da altre logiche
            }
        });
    }

    if(closeResetWifiModalBtn) closeResetWifiModalBtn.addEventListener('click', () => { if(confirmResetWifiModal) confirmResetWifiModal.hide(); });
    if(cancelResetWifiBtn) cancelResetWifiBtn.addEventListener('click', () => { if(confirmResetWifiModal) confirmResetWifiModal.hide(); });
    if(confirmResetWifiModalEl) {
        confirmResetWifiModalEl.addEventListener('hidden.bs.modal', () => {
            if (currentAppState !== APP_STATES.CONFIGURING) {
                // Non fa nulla
            }
        });
    }
});