// worker/index.js (The Cloudflare Worker API Backend)

// Define the public DoH endpoint
const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

// Default CORS headers for testing and API usage
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', // Allows all origins to access (Necessary for cross-origin calls)
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

/**
 * Handles the DNS lookup logic using Cloudflare's DoH service.
 * @param {string} domain The domain name to lookup.
 * @returns {Promise<string>} The resolved IPv4 address.
 */
async function resolveDomain(domain) {
    if (domain.length < 3 || domain.includes(' ')) {
        throw new Error('Invalid domain format.');
    }

    try {
        // Prepare the query parameters for DoH (Type A record for IPv4)
        const dohUrl = `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=A`;
        
        const dohResponse = await fetch(dohUrl, {
            headers: { 'Accept': 'application/dns-json' },
        });

        if (!dohResponse.ok) {
            throw new Error(`DNS resolution service failed with status: ${dohResponse.status}`);
        }

        const dohData = await dohResponse.json();
        
        // Check for DNS resolution error status
        if (dohData.Status !== 0) {
            // Status 3 is Non-Existent Domain (NXDOMAIN)
            if (dohData.Status === 3) {
                 throw new Error('Domain not found (NXDOMAIN).');
            }
            throw new Error(`DNS resolution failed with status code: ${dohData.Status}`);
        }

        const answer = dohData.Answer;
        if (!answer || answer.length === 0) {
            throw new Error('No A (IPv4) record found for this domain.');
        }

        // Find the first IPv4 (A record type is 1)
        const ipRecord = answer.find(record => record.type === 1); 

        if (!ipRecord || !ipRecord.data) {
            throw new Error('No valid IPv4 record found.');
        }

        return ipRecord.data;

    } catch (error) {
        throw new Error(error.message);
    }
}


// Cloudflare Worker Handler function
async function handleRequest(request) {
    const url = new URL(request.url);

    // Handle OPTIONS requests (preflight check for CORS)
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS, status: 204 });
    }

    // Check if the path is the intended lookup endpoint
    if (url.pathname !== '/lookup') {
        return new Response(JSON.stringify({ error: 'Not Found. Use /lookup endpoint.' }), {
            status: 404,
            headers: CORS_HEADERS,
        });
    }

    const domain = url.searchParams.get('domain');

    if (!domain) {
        return new Response(JSON.stringify({ error: 'Missing domain parameter.' }), {
            status: 400,
            headers: CORS_HEADERS,
        });
    }

    try {
        const ipAddress = await resolveDomain(domain);

        // Success response
        const responseData = {
            domain: domain,
            ip: ipAddress,
            family: 'IPv4',
            resolver: 'Cloudflare 1.1.1.1 DoH',
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: CORS_HEADERS,
        });

    } catch (error) {
        // Error response
        const errorMessage = error.message;
        const statusCode = errorMessage.includes('Not Found') || errorMessage.includes('NXDOMAIN') ? 404 : 500;
        
        return new Response(JSON.stringify({ 
            error: errorMessage,
            domain: domain
        }), {
            status: statusCode,
            headers: CORS_HEADERS,
        });
    }
}

// Listener for the Service Worker fetch event
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});
