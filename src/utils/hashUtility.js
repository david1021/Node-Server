import crypto from 'crypto';
import { Buffer } from 'node:buffer';

/**
 * Hashes a password using PBKDF2 with a randomly generated salt.
 * This method is suitable for securely storing user passwords.
 *
 * @param {string} password The plain-text password to hash.
 * @returns {Promise<{hash: string, salt: string}>} An object containing the hashed password and the salt used.
 * @throws {Error} If hashing fails.
 */
async function hashPasswordPBKDF2(password) {
    
    const salt = crypto.randomBytes(16).toString('hex');

    // 2. Define PBKDF2 parameters:
    //    - iterations: Number of iterations (higher means more secure but slower).
    //                  Recommended to be high (e.g., 100,000 to 300,000+).
    //                  Adjust based on CPU speed and desired security level.
    //    - keylen: Desired length of the derived key (hash output) in bytes.
    //              e.g., 64 bytes (512 bits) for SHA512.
    //    - digest: Hashing algorithm to use internally (e.g., 'sha512').
    const iterations = 100000; // A reasonable default, adjust based on performance
    const keylen = 64;         // 64 bytes = 512 bits
    const digest = 'sha512';   // SHA512 is a good choice

    return new Promise((resolve, reject) => {
        // crypto.pbkdf2 takes a callback
        crypto.pbkdf2(password, salt, iterations, keylen, digest, (err, derivedKey) => {
            if (err) {
                return reject(new Error(`PBKDF2 hashing failed: ${err.message}`));
            }
            // Convert the derived key (Buffer) to a string (e.g., hex) for storage
            resolve({
                hash: derivedKey.toString('hex'),
                salt: salt // Store the salt alongside the hash in your database
            });
        });
    });
}

/**
 * Verifies a plain-text password against a stored hashed password and salt.
 *
 * @param {string} password The plain-text password provided by the user.
 * @param {string} storedHash The hashed password retrieved from the database.
 * @param {string} storedSalt The salt retrieved from the database.
 * @returns {Promise<boolean>} True if the password matches, false otherwise.
 * @throws {Error} If verification fails.
 */
async function verifyPasswordPBKDF2(password, storedHash, storedSalt) {
    const iterations = 100000;
    const keylen = 64;
    const digest = 'sha512';

    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, storedSalt, iterations, keylen, digest, (err, derivedKey) => {
            if (err) {
                return reject(new Error(`PBKDF2 verification failed: ${err.message}`));
            }
            // Compare the newly generated hash with the stored hash using a secure comparison method
            // crypto.timingSafeEqual is crucial to prevent timing attacks.
            const newHashBuffer = Buffer.from(derivedKey.toString('hex'), 'hex'); // Convert new hash to buffer
            const storedHashBuffer = Buffer.from(storedHash, 'hex'); // Convert stored hash to buffer

            // Ensure buffers are of the same length before comparison
            if (newHashBuffer.length !== storedHashBuffer.length) {
                return resolve(false);
            }

            resolve(crypto.timingSafeEqual(newHashBuffer, storedHashBuffer));
        });
    });
}

export {hashPasswordPBKDF2, verifyPasswordPBKDF2};