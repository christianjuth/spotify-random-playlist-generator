require('dotenv').config()

const SpotifyWebApi = require('spotify-web-api-node');
const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuid } = require('uuid')
const path = require('path');

const app = express();
app.use(cookieParser());

const { 
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  PORT
} = {
  PORT: 3000,
  ...process.env
};

const scopes = ['playlist-modify-private'];
const states = {}

function getSpotifyClient(req) {
  const host = req.get('host');
  return new SpotifyWebApi({
    clientId: SPOTIFY_CLIENT_ID,
    clientSecret: SPOTIFY_CLIENT_SECRET,
    redirectUri: `http${req.secure ? 's' : ''}://${host}/auth-callback`
  });
}

async function authMiddleware(req, res, next) {
  const { spotifyAccessToken, spotifyRefreshToken } = req.cookies

  if (spotifyAccessToken && spotifyRefreshToken) {
    const spotifyApi = getSpotifyClient(req)
    spotifyApi.setAccessToken(spotifyAccessToken);
    spotifyApi.setRefreshToken(spotifyRefreshToken);
    req.spotifyApi = spotifyApi
    next()
  } else {
    res.redirect('/auth')
  }
}

app.get('/', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname + '/index.html'));
})

app.get('/auth', (req, res) => {
  const state = uuid()
  states[state] = true
  const url = getSpotifyClient(req).createAuthorizeURL(scopes, state);
  res.redirect(url)
})

app.get('/auth-callback', async (req, res) => {
  const { code, state } = req.query;

  if (!states[state]) {
    res.status(400).send({
      error: 'invalid state'
    })
  }
  delete states[state]

  const authData = await getSpotifyClient(req).authorizationCodeGrant(code);
  res.cookie('spotifyAccessToken', authData.body['access_token'], { expires: new Date(Date.now() + 60 * 60 * 1000), httpOnly: true, secure: true });
  res.cookie('spotifyRefreshToken', authData.body['refresh_token'], { expires: new Date(Date.now() + 60 * 60 * 1000), httpOnly: true, secure: true });

  res.redirect('/')
})

app.post('/new-playlist', authMiddleware, async (req, res) => {
  try {
    const songs = await Promise.all((new Array(50)).fill(0)
    .map(
      () => randomSong(req.spotifyApi)
    ))

    const songIds = songs.map(s => s?.body?.tracks?.items?.[0]?.uri ?? false).filter(Boolean)

    const playlist = await req.spotifyApi.createPlaylist('Random Playlist', { 'description': 'Random playlist...', 'public': false })

    await req.spotifyApi.addTracksToPlaylist(playlist.body.id, songIds)
    
    res.redirect(playlist.body.external_urls.spotify)
  } catch(e) {
    console.error(e);
    res.redirect('/auth')
  }
})

function randomString(maxLength) {
  let result             = '';
  const characters       = 'abcdefghijklmnopqrstuvwxyz0123456789$,.';
  const charactersLength = characters.length;
  const length = Math.round(Math.random() * maxLength);
  for ( var i = 0; i < length; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

async function randomSong(client) {
  const offset = Math.floor(Math.random() * 500);

  try {
    return await client.searchTracks(randomString(5), { limit: 1, offset })
  } catch(e) {
    return false 
  }
}


app.listen(PORT, () => {
  console.log(`app listening at http://localhost:${PORT}`)
})