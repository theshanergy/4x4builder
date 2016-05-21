var config = {
  'current': {
    'vehicle': {
      'id': 'toyota_4runner_3',
      'lift': 2,
      'color': 'red',
      'addons': {
        'bumper_f': 'shrockworks',
        'sliders': 'steel',
        'rack': 'whitson'
      }
    },
    'wheel': {
      'id': 'nitto_mud_grappler'
    }
  },
  'vehicles': {
    'toyota_4runner_3': {
      'name': '4Runner',
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
      'model': 'assets/models/vehicles/jeep/yj/yj.dae',
      'wheel_offset': 0.770,
      'axle_front': 1.31,
      'axle_rear': -1.09,
      'addons': {},
    },
  },
  'wheels': {
    'stock_toyota': {
      'name': 'Stock',
      'model': 'assets/models/wheels/stock_toyota.dae',
      'width': 0.256,
      'diameter': 0.777,
    },
    'nitto_mud_grappler': {
      'name': 'Nitto Mud Grappler',
      'model': 'assets/models/wheels/mud_grappler.dae',
      'width': 0.397,
      'diameter': 0.883,
    }
  }
}
