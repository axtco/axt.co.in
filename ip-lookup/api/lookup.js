// api/lookup.js

// Import the Node.js DNS module
const dns = require('dns');

// Promisify the lookup function for async/await use
const lookupPromise = (hostname) => {
    return new Promise((resolve, reject) => {
        // dns.lookup finds the first IP address associated with a hostname
        // This is equivalent to an A record lookup.
        dns.lookup(hostname, (err, address, family) => {
            if (err) {
                // Return a specific error if lookup fails
                if (err.code === 'ENOTFOUND') {
                    return reject('Domain not found or is invalid.');
                }
                return reject('DNS lookup failed: ' + err.message);
            }
            // address is the resolved IP, family is 4 or 6 (IPv4/IPv6)
            resolve({ address, family });
        });
    });
};


// Vercel/Next.js API Handler function
export default async function handler(req, res) {
    // 1. Check for the correct request method (GET is expected)
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Get the domain from the query parameters
    const domain = req.query.domain;

    if (!domain) {
        return res.status(400).json({ error: 'Missing domain parameter.' });
    }

    // Basic domain validation to prevent random strings/empty values
    // This is not exhaustive but helps
    if (domain.length < 3 || domain.includes(' ')) {
        return res.status(400).json({ error: 'Invalid domain format.' });
    }

    try {
        // 3. Perform the DNS lookup
        const result = await lookupPromise(domain);

        // 4. Success response
        res.status(200).json({ 
            domain: domain,
            ip: result.address,
            family: `IPv${result.family}`
        });

    } catch (error) {
        // 5. Error response
        console.error(`DNS lookup error for ${domain}:`, error);
        
        // Use the error message from lookupPromise if available, otherwise a generic one
        const errorMessage = typeof error === 'string' ? error : 'Failed to resolve the IP address.';

        // Use 404 for 'Domain not found' and 500 for other server errors
        const statusCode = errorMessage.includes('Domain not found') ? 404 : 500;
        
        res.status(statusCode).json({ 
            error: errorMessage 
        });
    }
}
