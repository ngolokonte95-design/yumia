Pod::Spec.new do |s|
  s.name           = 'YumiaCalls'
  s.version        = '1.0.0'
  s.summary        = 'Sonnerie d appel YUMIA app fermee (PushKit + CallKit)'
  s.description    = 'Sonnerie d appel YUMIA app fermee (PushKit + CallKit)'
  s.license        = 'UNLICENSED'
  s.author         = 'YUMIA'
  s.homepage       = 'https://yumia.eu'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CallKit', 'PushKit', 'AVFoundation'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
