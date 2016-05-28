var current = {
  'vehicle': {
    'id': 'toyota_4runner_3',
    'lift': 2,
    'color': '#CC0000',
    'addons': {
      'bumper_f': 'shrockworks',
      'sliders': 'steel',
      'rack': 'whitson'
    }
  },
  'wheels': {
    'rim': 'level_8_strike_6',
    'rim_size': 16,
    'tire': 'nitto_mud_grappler',
    'tire_size': 35,
  },
  'camera': {
    'auto': true,
    'speed': 0.001,
  }
};

var config = {
  'vehicles': {
    'toyota_4runner_3': {
      'name': '4Runner',
      'group': 'Toyota',
      'model': 'assets/models/vehicles/toyota/4runner/3g/4runner.dae',
      'wheel_offset': 0.770,
      'axle_front': 1.45,
      'axle_rear': -1.24,
      'addons': {
        'bumper_f': {
          'name': 'Bumper',
          'required': true,
          'options': {
            'stock': {
              'name': 'Stock',
              'model': 'assets/models/vehicles/toyota/4runner/3g/stock_bumper.dae',
            },
            'shrockworks': {
              'name': 'Shrockworks',
              'model': 'assets/models/vehicles/toyota/4runner/3g/shrockworks_bumper.dae'
            }
          }
        },
        'sliders': {
          'name': 'Sliders',
          'options': {
            'stock': {
              'name': 'Stock',
              'model': 'assets/models/vehicles/toyota/4runner/3g/stock_running_boards.dae',
            },
            'steel': {
              'name': 'Steel',
              'model': 'assets/models/vehicles/toyota/4runner/3g/sliders.dae'
            }
          }
        },
        'rack': {
          'name': 'Rack',
          'options': {
            'stock': {
              'name': 'Stock',
              'model': 'assets/models/vehicles/toyota/4runner/3g/stock_rack.dae'
            },
            'whitson': {
              'name': 'Whitson Metalworks',
              'model': 'assets/models/vehicles/toyota/4runner/3g/whitson_rack.dae'
            }
          }
        },
      }
    },
    'jeep_yj': {
      'name': 'Jeep YJ',
      'group': 'Jeep',
      'model': 'assets/models/vehicles/jeep/yj/yj.dae',
      'wheel_offset': 0.770,
      'axle_front': 1.31,
      'axle_rear': -1.09,
      'addons': {},
    },
    'jeep_jk': {
      'name': 'Jeep JK',
      'group': 'Jeep',
      'model': 'assets/models/vehicles/jeep/jk/JK_Unlimited_5door_2012.dae',
      'wheel_offset': 0.795,
      'axle_front': 1.5,
      'axle_rear': -1.26,
      'addons': {},
    },
    'jeep_xj': {
      'name': 'Jeep XJ',
      'group': 'Jeep',
      'model': 'assets/models/vehicles/jeep/xj/xj.dae',
      'wheel_offset': 0.76,
      'axle_front': 1.51,
      'axle_rear': -1.24,
      'addons': {},
    },
    // 'tacoma_dc_lb': {
    //   'name': 'Tacoma (Double Cab)',
    //   'group': 'Toyota',
    //   'model': 'assets/models/vehicles/toyota/tacoma/Toyota_Tacoma_DoubleCab_LongBed_2011.dae',
    //   'wheel_offset': 0.770,
    //   'axle_front': 1.97,
    //   'axle_rear': -1.59,
    //   'addons': {},
    // },
  },
  'wheels': {
    'rims': {
      'level_8_strike_6': {
        'name': 'Level 8 Strike 6',
        'model': 'assets/models/wheels/rims/level_8_strike_6.dae',
        'width': 0.318,
        'od': 0.488,
      }
    },
    'tires': {
      'nitto_mud_grappler': {
        'name': 'Nitto Mud Grappler',
        'model': 'assets/models/wheels/tires/nitto_mud_grappler.dae',
        'width': 0.397,
        'od': 0.883,
        'id': 0.488,
      },
    }
  }
}
