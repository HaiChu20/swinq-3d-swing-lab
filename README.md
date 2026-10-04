# SWINQ Swing Lab

**Every swing. Reconstructed.**

A browser app that turns raw data from a racket-mounted motion sensor (IMU) into an
interactive 3D forehand. Built for the SWINQ *Hack for Humanity* challenge.

## Features

- **3D swing reconstruction:** a real-size racket and player model follow the sensor data.
- **Data-only mode:** rebuilds the swing from the sensor alone, with no video needed.
- **Swing phases:** splits the stroke into take-back, forward swing, impact and follow-through.
- **Swing metrics:** angular velocity, swing duration, racket-head speed, face angle and swing path.
- **Synced playback:** video, sensor charts and the 3D view play side by side.
- **Bring your own data:** load any forehand CSV. The app works out how the sensor is mounted on the racket.

## How it works

1. **Sync:** the reference videos are 8× slow motion. Ball impact lines up the video with the sensor stream.
2. **Clean:** smooth out the vibration of the racket right after impact.
3. **Integrate:** add up the gyroscope readings to get the racket's orientation at every sample.
4. **Anchor:** gravity gives the down direction, and at impact the strings face the net.
5. **Render:** drive the 3D racket and player model with the result.
6. **Validate:** compare the 3D swing with the video.

## Getting started

**Requirements:** Python 3 (to serve the files locally) and a modern browser (Chrome recommended).
There is nothing else to install. Three.js is included in `vendor/`.

```bash
git clone git@github.com:HaiChu20/swinq-3d-swing-lab.git
cd swinq-3d-swing-lab
python3 -m http.server 8000
```

Then open **http://localhost:8000**. Press `Ctrl + C` in the terminal to stop the server.

> **Why a local server?** Browsers block pages opened straight from disk (`file://`)
> from reading data files. Any static file server works. Your data stays on your machine.

## Usage

| Action | Control |
|---|---|
| Play / pause | **Play** button or `Space` |
| Scrub through the swing | Drag the timeline slider |
| Jump to impact | `I` |
| Step one sample | `←` / `→` |
| Orientation source | **Data only** / **Video-fit** |
| Camera | **Side** / **Behind** / **Free** |
| Load another recording | **Load data (CSV)**, or drag a file onto the page |
| Return to the sample | **Back to sample shot** |

### CSV format

A recording needs the columns `ax, ay, az` (accelerometer) and `gx, gy, gz` (gyroscope).
See `data/aetekni.csv` for a second example recording.

## Project structure

```
.
├── index.html        # App shell: UI, charts and playback
├── js/
│   ├── stage.js      # 3D scene, camera and render loop
│   ├── imu.js        # Gyroscope integration → racket orientation
│   ├── calibrate.js  # Fits the sensor mounting to the video
│   ├── calibration.js  # Saved calibration for the sample shot
│   ├── dataonly.js   # Data-only start pose (gravity, handle axis)
│   ├── motion.js     # Video-derived hand path
│   ├── racket.js     # Racket model
│   └── body.js       # Player model
├── data/
│   ├── raw_data.csv  # Sample shot (synced with the demo videos)
│   └── aetekni.csv   # Additional recording to try
└── vendor/three/     # Three.js, bundled for offline use
```

The demo videos are streamed from remote storage, so the repository stays light.

## Troubleshooting

- **"Address already in use":** port 8000 is taken. Use another port, e.g. `python3 -m http.server 8080`,
  and open `http://localhost:8080`.
- **The page loads but shows no data:** make sure you opened it through `http://localhost:…`
  and not by double-clicking `index.html`.
