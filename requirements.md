# raw functionnal specification for BikeFlyOver

## Generic requirements

* BikeFlyOver is based on cesiumJS framework, and is
  written in Javascript, andembeded in an app using Electron

* the app is deployed on major OS, both desktop (MacOS, Windows
  and Linux) and Mobile (iOS, Android)

* the layout is responsive so it is ok on various resolutions

* the development follows state of the art qualitiy standard, and
  code should be commented in english, easy to maintain, and fully tested

## Application overview

* the pupose of the app is to generate "fly over" video from
  sport activity traces (typically TCX and/or FIT format)

* the video shows the track in 3D satelite view, and follow the track
  from a bird view or a first person view. 

* the user can add some photos and videos that are inserted at the right
  position (based on exif time data) 

* the user can customize viewpoint, and insert specific predefined camera
  mouvement at some point (eg. rotating aroud position)

* the user can export video in MP4 format

* other information present in TCX file (time, speed, ...)  can optionaly be displayed as a text 
  ior graphical overlay (or e.g. speedmeter)

##  Detailed GUI layout

GUI should consist of 

* video preview : current view at given time of the track

* control part :

  ** current time/position on the track (e.g. slider)

  ** information displayed for this position (e.g. speed, heart bpm, ..)

  ** camera position : altitude, movement, speed, etc...

  ** export as film

* import of TCX, FIT, picture, movie can be done either through a simple drag and drop,
  or through a menu

* several TCX or FIT may be imported and joined together ; camera should "fly jump" from one segment to
  another

* insertion of photo and video is based on EXIF timestamp

* control panel provides field to fix / update this time in case camera and gps were not
  fully synchronized

* video resolution can be selected by user

* video format, either landscape, square or portrait can be selected by user

* project can be saved and loaded locally
