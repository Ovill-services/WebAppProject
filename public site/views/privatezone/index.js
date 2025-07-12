import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import { appendFile } from 'fs';

const app = express();

app.get('/private-zone', (req, res) => {
    res.render('index.ejs', {
        page: 'dashboard'
    });
    console.log('Private zone accessed');
});