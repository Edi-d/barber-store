Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Bridges the Tapzi appointment Live Activity (ActivityKit) to JS.'
  s.description    = 'Starts, updates, ends, and enumerates the appointment Live Activity from React Native.'
  s.author         = ''
  s.homepage       = 'https://tapzi.ro'
  s.platforms      = {
    :ios => '16.2'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
