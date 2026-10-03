# SWINQ Swing Lab: Every swing. Reconstructed.

A web app that turns the data from a racket's sensor into a 3D forehand.
Built for the SWINQ "Hack for Humanity" challenge.

## What it does
- Shows how the racket moves during the swing, using the sensor data.
- Works from the data alone, without needing the video.
- Splits the swing into its parts: take-back, forward swing, hit and follow-through.
- Shows swing numbers: how fast the racket turns, swing time, racket speed,
  racket face angle and swing direction.
- Plays the video, sensor charts and 3D swing side by side.
- Opens any forehand data file, and works out how the sensor sits on the racket.

## How it works
1. **Line up:** the videos are 8× slow motion. The moment the ball hits the
   strings lines up the video and the data.
2. **Clean:** smooth out the racket's shaking right after the hit.
3. **Turn:** add up all the small turns the sensor measures to get the racket's
   direction at every moment.
4. **Start:** gravity shows which way is down, and at the hit the strings face the net.
5. **Show:** move a real-size 3D racket and a player model with it.
6. **Check:** compare the 3D swing with the video.

## How to run it

You only need **Python 3** (already on most Macs) and a web browser (Chrome works best).
Nothing else to install.

1. **Get the code**
   ```bash
   git clone git@github.com:hoanglhh/SWINQ-3D-stroke-from-sensor-data.git
   cd SWINQ-3D-stroke-from-sensor-data
   ```

2. **Start the small local server**
   ```bash
   python3 serve.py
   ```
   You should see: `Swing Lab running at http://localhost:8000`.
   Keep this Terminal window open while you use the app.

3. **Open the app** at **http://localhost:8000** in your browser.

4. **Stop it** with `Ctrl + C` in the Terminal.

> Why a server? Browsers don't let a page read the data file and videos when you
> just double-click `index.html`, so `serve.py` serves them locally. Nothing is sent
> to the internet, and the app also works offline.

### Using the app
- **Play** (or press `Space`) to watch the swing. **Drag the slider** to move through it.
- **I** jumps to the moment of the hit. **← →** step one reading.
- **Data only / Video-fit** switches how the swing's start position is found.
- **Side / Behind / Free** changes the 3D camera.
- **Load data (CSV)**, or drag a file onto the page, to try another forehand.
  Try `aetekni.csv`. The file needs the columns `ax, ay, az, gx, gy, gz`.
- **Back to sample shot** returns to the original swing with its videos.

### If something goes wrong
- **"Address already in use"** when starting: the server is already running.
  Just open http://localhost:8000, or close the other Terminal window first.
- **Page loads but no data or video:** make sure you opened it through
  http://localhost:8000, not by double-clicking `index.html`.

## Files
| File | What it is |
|---|---|
| `index.html` | The app page |
| `js/` | The 3D scene, the sensor maths and the player model |
| `serve.py` | The small local server |
| `raw_data.csv`, `swing_angle_1.mp4`, `swing_angle_2.mp4` | The sample swing and its two videos |
| `aetekni.csv` | Another recording to try |
| `vendor/three/` | The 3D library (Three.js), included so it works offline |
