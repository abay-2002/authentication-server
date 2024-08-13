import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import db from './config/database.js';
import { randomBytes } from 'crypto';
import fernet from 'fernet';
import nodemailer from 'nodemailer'
import bcrypt from 'bcrypt';

// SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'akbar121202@gmail.com',
      pass: 'lzrk gqwp lmsq muoc'
    }
});
  
const app = express();

app.use(cors());
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

app.get('/', (req, res) => {
    res.json({ message: 'Hello World'})
});

app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        async function isRegister(email){
            return new Promise((resolve, reject) => {
                db.query(`
                    SELECT id 
                    FROM users
                    WHERE email = ?;
                `, [email], (err, responses) => {
                    if(err) reject(err)
                    if(responses.length > 0){
                        return resolve({ message: 'Email already registered!', status: 406, bool: false })
                    } else {
                        return resolve({ message: 'User not found', status: 200, bool: true })
                    }
                });
            });
        }

        async function insertUser(username, email, password){
            return new Promise((resolve, reject) => {
                // Hash password
                bcrypt.hash(password, 10, function(err, hashed) {
                    if(err) reject(err)
                    db.query(`
                        INSERT INTO users(id, name, email, password)
                        VALUES(?, ?, ?, ?);
                    `, [uuidv4(), username, email, hashed], (err) => {
                        if(err) reject(err)
                        return resolve({ message: `Successfully registered user!`, status: 200 })
                    });
                });
            });
        }

        const isRegistered = await isRegister(email);
        
        if(isRegistered.bool){
            const register = await insertUser(username, email, password)
            return res.status(register.status).json({ message: register.message });
        } else {
            return res.status(isRegistered.status).json({ message: isRegistered.message });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body; 

        async function isRegister(email){
            return new Promise((resolve, reject) => {
                db.query(`
                    SELECT id 
                    FROM users
                    WHERE email = ?;
                `, [email], (err, responses) => {
                    if(err) reject(err)
                    if(responses.length > 0){
                        return resolve({ message: 'Email already registered!', status: 200, bool: true })
                    } else {
                        return resolve({ message: 'Unauthorized!', status: 401, bool: false })
                    }
                });
            });
        }

        async function matchPassword(email, password){
            return new Promise((resolve, reject) => {
                db.query(`
                    SELECT password
                    FROM users
                    WHERE email = ?;    
                `, [email], (err, responses) => {
                    if(err) reject(err)
                    if(responses.length > 0){
                        const db_password = responses[0].password; // hashed
                        bcrypt.compare(password, db_password, function(err, result) {
                            if(err) reject(err);
                            if(result){
                                return resolve(true);
                            } else {
                                return resolve(false);
                            }
                        });
                    }
                });
            });
        }

        function encryptString(rawText){
            const key = randomBytes(32).toString('base64');
            const secret = new fernet.Secret(key);
        
            const token = new fernet.Token({
                secret: secret,
                time: Date.now(),
                ttl: 600 // in seconds
            });

            const encrypted = token.encode(rawText);

            return {encrypted, key}
        }

        async function createSession(email){
            return new Promise((resolve, reject) => {
                
                const id = uuidv4();
                
                const { encrypted, key } = encryptString(id);

                db.query(`
                    UPDATE users
                    SET 
                    session_id = ?,
                    session_key = ?
                    WHERE email = ?;
                `, [id, key, email], (err) => {
                    if(err) reject(err);
                    return resolve({ session_id: encrypted });
                });
            });
        }

        async function getUserId(email){
            return new Promise((resolve, reject) => {
                db.query(`SELECT id FROM users WHERE email = ?`, [email], (err, responses) => {
                    if(err) reject(err)
                    return resolve({ user_id: responses[0].id })
                })
            });
        }

        const isRegistered = await isRegister(email)

        if(isRegistered.bool){
            const isPasswordMatch = await matchPassword(email, password);
            if(isPasswordMatch){
                createSession(email)
                .then(response => {
                    const sessionId = response.session_id;
                    getUserId(email)
                    .then(response => {
                        const userId = response.user_id;
                        return res.status(200).json({ message: 'User Authenticate!', user_id: userId, session_id: sessionId});
                    })
                    .catch(err => {
                        console.error(err)
                    });
                })
                .catch(err => {
                    console.error(err)
                });
            } else { // Unmatched password
                return res.status(401).json({ message: 'User unauthenticate!' });
            }
        } else { // Email is not registered
            return res.status(401).json({ message: 'User unauthenticate!' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/logout', async (req, res) => {
    try {
        const { user_id } = req.body;

        async function removeSessionId(user_id){
            return new Promise((resolve, reject) => {
                db.query(`
                    UPDATE users
                    SET 
                    session_id = NULL,
                    session_key = NULL
                    WHERE id = ?; 
                `, [user_id], (err) => {
                    if(err) reject(err);
                    resolve(true)
                });
            });
        }

        removeSessionId(user_id)
        .then(_ => {
            return res.status(200).json({ message: 'Successfully logged out!'});
        })
        .catch(err => {
            return res.status(400).json({ message: 'Bad request' });
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });     
    }
});

app.post('/authentication/token', async (req, res) => {
    try {
        const { user_id, session_id } = req.body;

        function decryptString(inputKey, encryptedString){
            let key = new fernet.Secret(inputKey);
          
            try {
              let token = new fernet.Token({
                  secret: key,
                  token: encryptedString,
                  ttl: 600 // in seconds (must match the TTL used during encryption)
              });
        
              return token.decode();
            } catch (error) {
                return null;
            }
        }

        async function getSessionId(user_id){
            return new Promise((resolve, reject) => {
                db.query(`
                    SELECT session_id, session_key 
                    FROM users 
                    WHERE id = ?;    
                `, [user_id], (err, responses) => {
                    if(err) reject(err);
                    if(responses.length > 0){                        
                        return resolve({ 
                            session_key: responses[0].session_key, 
                            session_id: responses[0].session_id, 
                            status: 200 
                        });
                    } else {
                        return reject({ message: 'Unauthorized!', status: 401 });
                    }
                });
            });
        }

        getSessionId(user_id)
        .then(responses => {
            const db_session_id = responses.session_id;
            const db_session_key = responses.session_key;

            const decrypted_session = decryptString(db_session_key, session_id);

            if(db_session_id === decrypted_session){
                return res.status(200).json({ message: 'Authorized!' });
            } else {
                return res.status(401).json({ message: 'Unauthorized!' });
            }
        })
        .catch(error => {
            return res.status(error.status).json({ message: error.message })
        });
    } catch (error) {
        
    }
});

app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        async function checkOneTimeUrl(email){
            return new Promise((resolve, reject) => {                          
                db.query(`
                    SELECT id FROM url
                    WHERE type = "otu"
                    AND user_email = ?
                `, [email]
                , (err, responses) => {
                    if(err) reject(err);

                    if(responses.length > 0){
                        reject(false);
                    } else {
                        resolve(true)
                    }
                });
            });
        }

        async function createOneTimeUrl(email){
            return new Promise((resolve, reject) => {          
                
                const value = uuidv4();
                
                db.query(`
                    INSERT INTO url(id, user_email, value, type)
                    VALUES(?, ?, ?, ?);
                `, [uuidv4(), email, value, 'otu']
                , (err) => {
                    if(err) reject(err);
                    resolve({ value: value });
                });
            });
        }

        checkOneTimeUrl(email)
        .then(_ => {
            createOneTimeUrl(email)
            .then(res => {
                const otu = res.value;

                const html = `
                    Go to <a href="http://localhost:5173/change-password/${otu}/${email}">change my password</a> to reset your password!
                `;
        
                const mailOptions = {
                    from: 'akbar121202@gmail.com',
                    to: email,
                    subject: `Change password`,
                    html: html
                };
                
                transporter.sendMail(mailOptions, function(error, info){
                    if (error) {
                        console.log(error);
                    } else {
                        res.status(200).json({ message: `Password change url sent, check your email!` });
                    }
                });  
            })
            .catch(_ => {
                return res.status(500).json({ message: 'Internal server error' });
            });
        })
        .catch(err => {
            return res.status(400).json({ message: 'user already request forgot password'})
        })

    } catch (error) {
        
    }
});

app.post('/change-password', async (req, res) => {
    try {
        const { password, email, otu } = req.body
    
        async function validateOtu(email, otu){
            return new Promise((resolve, reject) => {
                db.query(`
                    SELECT user_email 
                    FROM url 
                    WHERE user_email = ?
                    AND value = ?
                    AND type = "otu";
                `, [email, otu], (err, responses) => {
                    if(err) reject(err);
                    if(responses.length > 0){
                        resolve(true);
                    } else {
                        reject(false);
                    }
                });
            });
        }

        async function deleteOtu(email){
            return new Promise((resolve, reject) => {
                db.query(`DELETE FROM url WHERE type = "otu" AND user_email = ?`, [email], (err) => {
                    if(err) reject(err);
                    resolve(true);
                });
            });
        }

        async function changePassword(password, email){
            return new Promise((resolve, reject) => {
                bcrypt.hash(password, 10).then((hashed) => {
                    db.query(`
                        UPDATE users
                        SET password = ?
                        WHERE email = ?;    
                    `, [hashed, email], (err) => {
                        if(err) reject(err)
                        resolve(true)
                    });
                });
            });
        }

        validateOtu(email, otu)
        .then(_ => {
            deleteOtu(email)
            .then(_ => {
                changePassword(password, email)
                .then(_ => {
                    return res.status(200).json({ message: 'Successfully changed password!' });
                })
                .catch(err => {
                    return res.status(401).json({ message: 'Invalid OTU' });
                });
            })
            .catch(err => {
                return res.status(401).json({ message: 'Invalid OTU' });
            });
        })
        .catch(err => {
            return res.status(401).json({ message: 'Invalid OTU' });
        });
    } catch (error) {
        return res.status(401).json({ message: 'Invalid OTU' });
    }
})

const PORT = 8000;

app.listen(PORT, () => {
    console.log(`App is listening on http://localhost:${PORT}`);
});