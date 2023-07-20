  const express = require('express');
  const app = express();
  const { google } = require('googleapis');
  const axios = require('axios');
  const yaml = require('js-yaml');
  const fs = require('fs');
  const cookieParser = require('cookie-parser');
  // Serve static files from the "public" directory
  app.use(express.static('public'));

  // Parse JSON bodies
  app.use(express.json());
  app.use(cookieParser());

  // Read the configuration from the YAML file
  const config = yaml.load(fs.readFileSync('config.yaml', 'utf8'));

  // Define the index route
  app.get('/', (req, res) => {
    // Check if authentication_token cookie is present and matches the token from the config
    const isAuthenticated = req.cookies.authentication_token != undefined

    if (isAuthenticated) {
      res.redirect('/data-entry');
    } else {
      res.sendFile(__dirname + '/public/login.html');
    }
  });

 // Define the /sheet route for saving data
  app.post('/sheet', async (req, res) => {
    const { name, mobile } = req.body;

    // Create the values to be written to the sheet
    const values = [[name, mobile]];

    try {
      // Get the refresh token from the cookie
      const refreshToken = req.cookies.refresh_token; // Update with the correct cookie name

      // Create the credentials object
      const credentials = {
        type: 'authorized_user',
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: refreshToken
      };
      client = google.auth.fromJSON(credentials);
      // Create a new Google Sheets instance with the authenticated client
      const sheets = google.sheets({
        version: 'v4',
        auth: client
      });

      // Check if the access token is valid
      const isValidToken = await isAccessTokenValid(req.cookies.authentication_token);

      if (isValidToken) {
        // Create the request object
        const request = {
          spreadsheetId: config.spreadsheet_id, // Use the spreadsheet ID value from the config
          range: 'Sheet1', // Replace with the actual sheet name and range where you want to write the data
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: values
          }
        };

        // Make the request to update the sheet
        sheets.spreadsheets.values.append(request, (err, response) => {
          if (err) {
            console.error('Error:', err);
            res.status(500).json({ message: 'Error saving data to Google Sheets' });
          } else {
            console.log('Data saved to Google Sheets');
            res.json({ message: 'Data saved successfully' });
          }
        });
      } else {
        res.status(401).json({ message: 'Invalid or expired access token' });
      }
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ message: 'Error authorizing Google Sheets client' });
    }
});


  // Define the /oauth2callback route
  app.get('/oauth2callback', (req, res) => {
    const code = req.query.code; // Authorization code received in the redirect URI

    // Exchange the authorization code for an access token and refresh token
    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const params = {
      code: code,
      client_id: config.client_id, // Use the client ID value from the config
      client_secret: config.client_secret, // Use the client secret value from the config
      redirect_uri: 'http://localhost:3000/oauth2callback',
      grant_type: 'authorization_code'
    };

    axios.post(tokenEndpoint, params)
      .then(response => {
        const accessToken = response.data.access_token;
        const refreshToken = response.data.refresh_token;
        // Store the access token and refresh token securely for future use

        // Set the authentication_token cookie
        res.cookie('authentication_token', accessToken, { httpOnly: true });
        res.cookie('refresh_token', refreshToken, { httpOnly: true });

        // Redirect the user to the data entry page
        res.redirect(302, '/data-entry');
      })
      .catch(error => {
        console.error('Error:', error);
        // Redirect the user to an error page or display an error message
        res.send('Authentication failed!');
      });
  });

  // Define the data entry route
  app.get('/data-entry', (req, res) => {
    // Check if authentication_token cookie is present and matches the token from the config
    const isAuthenticated = req.cookies.authentication_token != undefined

    if (isAuthenticated) {
      res.sendFile(__dirname + '/public/data-entry.html');
    } else {
      res.redirect('/');
    }
  });

  // Start the server
  const port = 3000;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });


  // Function to check if the access token is valid
  function isAccessTokenValid(accessToken) {
    const introspectionEndpoint = 'https://oauth2.googleapis.com/tokeninfo';
    const now = Math.floor(Date.now() / 1000); // Get the current time in seconds

    return axios.get(introspectionEndpoint, {
      params: {
        access_token: accessToken,
      },
    })
      .then(response => {
        const tokenInfo = response.data;
        return tokenInfo.exp >= now;
      })
      .catch(error => {
        console.error('Error:', error);
        return false;
      });
  }