import numpy as np

central_meridian = 0  # degrees; east positive

def project(lon, lat):
    # Inputs: NumPy arrays of longitude and latitude in radians.
    lon = (lon - np.radians(central_meridian) + np.pi) % (2 * np.pi) - np.pi
    # TODO: Find an auxiliary angle for each latitude.
    # TODO: Use that angle and longitude to calculate x and y.
    # Return two arrays with the same shape as the inputs.
    raise NotImplementedError("Your projection is unfinished. Start with hint 1, then replace the TODOs.")
