import express from 'express';
import mysql from 'mysql';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

const db = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : '',
  database : 'authentication-example'
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
                    if(responses.affectedRows > 0){
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

const PORT = 8000;

app.listen(PORT, () => {
    console.log(`App is listening on http://localhost:${PORT}`);
});