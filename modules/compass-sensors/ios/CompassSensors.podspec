require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'CompassSensors'
  s.version        = package['version']
  s.summary        = 'System compass heading, sensor accuracy and WMM declination (Android) / CoreMotion heading (iOS).'
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'Pusula'
  s.homepage       = 'https://github.com/'
  # SDK 57'nin iOS tabanÄ± ile aynÄ±: Expo Haptics/Location da 16.4 istiyor.
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/expo/expo.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "ios/**/*.{h,m,mm,swift,hpp,cpp}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

