// worker/index.js (The API Backend)

// Define the public DoH endpoint
const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

/**
 * Handles incoming requests to the Worker.
 * @param {Request} request
 */
async function handleRequest(request) {
    const url = new URL(request.url);

    // 1. Check for the correct path and query parameter
    if (url.pathname !== '/lookup') {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const domain = url.searchParams.get('domain');

    if (!domain || domain.length < 3) {
        return new Response(JSON.stringify({ error: 'Missing or invalid domain parameter.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Perform DNS over HTTPS (DoH) query
    try {
        // Prepare the query parameters for DoH (Type A record for IPv4)
        const dohUrl = `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=A`;
        
        const dohResponse = await fetch(dohUrl, {
            headers: { 'Accept': 'application/dns-json' },
        });

        const dohData = await dohResponse.json();
        
        // 3. Process the DoH response
        if (dohData.Status !== 0) {
            // DNS resolution failed (e.g., domain doesn't exist)
            throw new Error('DNS resolution failed.');
        }

        const answer = dohData.Answer;
        if (!answer || answer.length === 0) {
            throw new Error('No A (IPv4) record found for this domain.');
        }

        // Find the first IPv4 (A) record
        const ipRecord = answer.find(record => record.type === 1); 

        if (!ipRecord) {
            throw new Error('No A (IPv4) record found for this domain.');
        }

        // 4. Success response
        const responseData = {
            domain: domain,
            ip: ipRecord.data,
            family: 'IPv4',
            resolver: 'Cloudflare 1.1.1.1 DoH',
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // IMPORTANT: For CORS if testing from non-Cloudflare/local
            },
        });

    } catch (error) {
        // 5. Error response
        const errorMessage = error.message || 'An unknown API error occurred.';
        
        return new Response(JSON.stringify({ 
            error: errorMessage,
            domain: domain
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// Listener for the Service Worker fetch event
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});
