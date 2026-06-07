// App entry point.
// Importing the global stylesheet wires up NativeWind v4's className support
// before any component renders. registerRootComponent mirrors expo/AppEntry.
import "./global.css";
import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
