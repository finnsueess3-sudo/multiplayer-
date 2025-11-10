body {
    margin: 0;
    overflow: hidden;
    background-color: #87ceeb; /* Himmelblau */
    font-family: sans-serif;
}

canvas {
    display: block;
}

/* Fadenkreuz */
#crosshair {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin-left: -10px;
    margin-top: -10px;
    pointer-events: none;
}

#crosshair::after {
    content: '';
    position: absolute;
    left: 9px;
    top: 0;
    width: 2px;
    height: 20px;
    background: red;
}

#crosshair::before {
    content: '';
    position: absolute;
    top: 9px;
    left: 0;
    width: 20px;
    height: 2px;
    background: red;
}

/* Mobile Steuerung */
#mobileControls {
    position: absolute;
    bottom: 10px;
    width: 100%;
    display: flex;
    justify-content: space-between;
    padding: 0 20px;
}

.controlButton {
    width: 60px;
    height: 60px;
    background: rgba(0,0,0,0.5);
    border-radius: 50%;
    text-align: center;
    line-height: 60px;
    color: white;
    font-weight: bold;
    user-select: none;
}
