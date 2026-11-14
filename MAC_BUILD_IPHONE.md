# Building the real iPhone app (needs a Mac)

An iPhone app can only be compiled with Apple's Xcode, which only runs on macOS. This project is already set up
for it (Capacitor wraps the game in a native iOS app). On a Mac:

1. Install Xcode (App Store), Node.js (nodejs.org) and CocoaPods (`sudo gem install cocoapods`).
2. Copy this whole folder to the Mac, open Terminal inside it and run:

       npm install
       npm run ios:setup
       npm run ios:open

3. In Xcode: click the "App" project -> Signing & Capabilities -> pick your Apple ID team.
   Under Deployment Info set the orientation to Landscape Left/Right only.
4. Plug in the iPhone (enable Developer Mode in Settings > Privacy & Security), choose it at the top and press Run.
   A free Apple ID installs it for 7 days; a paid developer account ($99/year) lets you keep it installed
   and share it through TestFlight or the App Store.

After changing the game later: `npm run ios:sync`, then Run again in Xcode.

No Mac? Rent one by the hour (e.g. MacinCloud) or use a macOS cloud build service, then follow the same steps.
