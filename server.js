import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import db from './config/database.js';

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
                db.query(`
                    INSERT INTO users(id, name, email, password)
                    VALUES(?, ?, ?, ?);
                `, [uuidv4(), username, email, password], (err) => {
                    if(err) reject(err)
                    return resolve({ message: `Successfully registered user!`, status: 200 })
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
    // TODOS:
    // 1. validate is email registered? true:
        // compare is password match? true:
            // response 200 message: 'User Authenticate'
        // else:
            // response 401 message: 'User Unauthenticate'
    // else:
        // response 401 message: 'User is not registered!'
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
                        const db_password = responses[0].password;

                        if(password === db_password){
                            return resolve(true);
                        } else {
                            return resolve(false);
                        }
                    }
                });
            });
        }

        const isRegistered = await isRegister(email)

        if(isRegistered.bool){
            const isPasswordMatch = await matchPassword(email, password);
            if(isPasswordMatch){
                return res.status(200).json({ message: 'User Authenticate!' });
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

const PORT = 8000;

app.listen(PORT, () => {
    console.log(`App is listening on http://localhost:${PORT}`);
});