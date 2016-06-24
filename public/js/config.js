var current = {
  'vehicle': {
    'id': 'toyota_4runner_3',
    'lift': 0,
    'color': '#CC0000',
    'reflectivity': '0.5',
    'addons': {}
  },
  'wheels': {
    'rim': 'cragar_soft_8',
    'rim_color': 'silver',
    'rim_size': 16,
    'rim_width': 10,
    'tire': 'bfg_at',
    'tire_size': 32,
    'spare': false,
  },
  'camera': {
    'auto': true,
    'speed': 0.001,
  }
};

var config = {
  'vehicles': {
    'toyota_4runner_3': {
      'name': 'Toyota 4Runner',
      'make': 'Toyota',
      'model': 'assets/models/vehicles/toyota/4runner/3g/4runner.dae',
      'wheel_offset': 0.770,
      'axle_front': 1.45,
      'axle_rear': -1.24,
      'placement': {
        'spare_tire': {'x': 0, 'y': 0.7, 'z': -2.45}
      },
      'default_addons': {
        'bumper_f': 'stock',
        'sliders': 'stock',
        'rack': 'stock'
      },
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
          'required': false,
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
          'required': false,
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
    'toyota_j80': {
      'name': 'Toyota Land Cruiser (J80)',
      'make': 'Toyota',
      'model': 'assets/models/vehicles/toyota/land_cruiser/j80/j80.dae',
      'wheel_offset': 0.78,
      'axle_front': 1.545,
      'axle_rear': -1.31,
      'default_addons': {},
      'addons': {},
    },
    'tacoma_dc_lb': {
      'name': 'Toyota Tacoma (Double Cab)',
      'make': 'Toyota',
      'model': 'assets/models/vehicles/toyota/tacoma/tacoma_2011_lb_dc.dae',
      'wheel_offset': 0.81,
      'axle_front': 1.97,
      'axle_rear': -1.59,
      'addons': {},
    },
    'jeep_yj': {
      'name': 'Jeep YJ',
      'make': 'Jeep',
      'model': 'assets/models/vehicles/jeep/yj/yj.dae',
      'wheel_offset': 0.770,
      'axle_front': 1.31,
      'axle_rear': -1.09,
      'default_addons': {},
      'addons': {},
    },
    'jeep_jk': {
      'name': 'Jeep JK',
      'make': 'Jeep',
      'model': 'assets/models/vehicles/jeep/jk/JK_Unlimited_5door_2012.dae',
      'wheel_offset': 0.795,
      'axle_front': 1.45,
      'axle_rear': -1.26,
      'default_addons': {},
      'addons': {},
    },
    'jeep_xj': {
      'name': 'Jeep XJ',
      'make': 'Jeep',
      'model': 'assets/models/vehicles/jeep/xj/xj.dae',
      'wheel_offset': 0.76,
      'axle_front': 1.51,
      'axle_rear': -1.24,
      'default_addons': {},
      'addons': {},
    },
  },
  'wheels': {
    'rims': {
      'level_8_strike_6': {
        'name': 'Level 8 Strike 6',
        'model': 'assets/models/wheels/rims/level_8_strike_6.dae',
        'width': 0.318,
        'od': 0.488,
      },
      'konig_countersteer': {
        'name': 'Konig Countersteer',
        'model': 'assets/models/wheels/rims/konig_countersteer.dae',
        'width': 0.256,
        'od': 0.47,
      },
      'cragar_soft_8': {
        'name': 'Cragar Soft 8',
        'model': 'assets/models/wheels/rims/cragar_soft_8.dae',
        'width': 0.247,
        'od': 0.442,
      },
      'moto_metal_mO951': {
        'name': 'Moto Metal MO951',
        'model': 'assets/models/wheels/rims/moto_metal_mO951.dae',
        'width': 0.242,
        'od': 0.407,
      },
      'ar_mojave': {
        'name': 'American Racing Mojave',
        'model': 'assets/models/wheels/rims/ar_mojave.dae',
        'width': 0.244,
        'od': 0.448,
      },
    },
    'tires': {
      'nitto_mud_grappler': {
        'name': 'Nitto Mud Grappler',
        'model': 'assets/models/wheels/tires/nitto_mud_grappler.dae',
        'width': 0.32,
        'od': 0.883,
        'id': 0.48,
      },
      'bfg_at': {
        'name': 'BFGoodrich A/T',
        'model': 'assets/models/wheels/tires/bfg_at.dae',
        'width': 0.26,
        'od': 0.895,
        'id': 0.43,
      },
      'km2': {
        'name': 'BFGoodrich KM2',
        'model': 'assets/models/wheels/tires/km2.dae',
        'width': 0.245,
        'od': 0.837,
        'id': 0.44,
      },
      'thornbird': {
        'name': 'Interco TSL Thornbird',
        'model': 'assets/models/wheels/tires/interco_thornbird.dae',
        'width': 0.26,
        'od': 0.871,
        'id': 0.385,
      },
    }
  }
}
