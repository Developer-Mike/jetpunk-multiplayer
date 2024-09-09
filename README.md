# Jetpunk Multiplayer

<h3 align="center">
    <img alt="Icon" src="./assets/icon.svg" width="100">
    <br/><br/>
    The Multiplayer Plugin for <a href="https://www.jetpunk.com">JetPunk</a> using <a href="https://tampermonkey.net/">Tampermonkey</a>
</h3>

<p align="center">
    <b>🎮 Quadruple</b> the fun of solving quizzes on JetPunk by playing with friends in real-time!
</p>

## Installation
1. Install [Tampermonkey](https://tampermonkey.net/)
2. Either
    - Use the hosted server on <a href="https://render.com">Render</a> by clicking [HERE](https://jetpunk-multiplayer.onrender.com/client/index.user.js) (It can take a minute or so to get the server out of hibernation)
    - Clone this repository, run `npm i` followed by `npm run build` and start the server using `npm run start`. After that, navigate to `http://localhost:3000/client/index.user.js` (or the respective URL and port) and install the script. (Make sure to have the server running while using the plugin)
3. Go to [JetPunk](https://www.jetpunk.com) and enjoy the multiplayer experience using the new "Multiplayer" button located on top of every quiz page.
    - Create a room by entering a unique room name
    - Join a room by entering the room name on any quiz page (You'll be redirected to the room if it exists)

## Features
- Support for all text-based quizzes (no support for drag and drop quizzes)
  - My favorite quizzes 😊
    - https://www.jetpunk.com/quizzes/how-many-countries-can-you-name
    - https://www.jetpunk.com/quizzes/flags-of-the-world-quiz

## Screenshots
![Screen Recording](./assets/screenshots/screenrecording.mp4)