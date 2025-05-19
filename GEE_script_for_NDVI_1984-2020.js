// Load a collection of Landsat TOA reflectance images.
// Note: the path to load remotely sensed products are changed after 2023.
// However, following google earth engine code was used to produce the required values.
//var landsatCollection = ee.ImageCollection("LANDSAT/LC08/C01/T1_TOA");
//var landsatCollection = ee.ImageCollection("LANDSAT/LE07/C01/T1_TOA");
//var landsatCollection = ee.ImageCollection("LANDSAT/LT05/C01/T1_TOA");
// Set the region of interest to a point.
// Generate graph showing NDVI for Landsat 5, 7, and 8 products to produce result from 1984 to 2020 for Isosuo field in Tyrnävä  
//Isosuo                                          
var aoi2 = ee.Geometry.Polygon([[
                                          [25.72215,64.7591],[25.7257,64.75835],
                                          [25.72102,64.7558],[25.71753,64.75662]]])
// The dependent variable we are modeling.
var dependent = 'NDVI';
// The number of cycles per year to model.
var harmonics = 1;
// Make a list of harmonic frequencies to model.
// These also serve as band name suffixes.
var harmonicFrequencies = ee.List.sequence(1, harmonics);
// Function to get a sequence of band names for harmonic terms.
var constructBandNames = function(base, list) {
  return ee.List(list).map(function(i) {
    return ee.String(base).cat(ee.Number(i).int());
  });
};
// Construct lists of names for the harmonic terms.
var cosNames = constructBandNames('cos_', harmonicFrequencies);
var sinNames = constructBandNames('sin_', harmonicFrequencies);
// Independent variables.
var independents = ee.List(['constant', 't'])
  .cat(cosNames).cat(sinNames);
// Function to mask clouds in Landsat 8 imagery...might be useful to other landsat images as well
var maskClouds = function(image) {
  var score = ee.Algorithms.Landsat.simpleCloudScore(image).select('cloud');
  var mask = score.lt(10);
  return image.updateMask(mask);
};
// Function to add an NDVI band, the dependent variable.
var addNDVI = function(image) {
  return image
    //.addBands(image.normalizedDifference(['B5', 'B4']) // for L8
    .addBands(image.normalizedDifference(['B4', 'B3']) // for 7 and 5
    .rename('NDVI'))
    .float();
};
// Function to add a time band.
var addDependents = function(image) {
  // Compute time in fractional years since the epoch.
  var years = image.date().difference('1970-01-01', 'year');
  var timeRadians = ee.Image(years.multiply(2 * Math.PI)).rename('t');
  var constant = ee.Image(1);
  return image.addBands(constant).addBands(timeRadians.float());
};
// Function to compute the specified number of harmonics
// and add them as bands.  Assumes the time band is present.
var addHarmonics = function(freqs) {
  return function(image) {
    // Make an image of frequencies.
    var frequencies = ee.Image.constant(freqs);
    // This band should represent time in radians.
    var time = ee.Image(image).select('t');
    // Get the cosine terms.
    var cosines = time.multiply(frequencies).cos().rename(cosNames);
    // Get the sin terms.
    var sines = time.multiply(frequencies).sin().rename(sinNames);
    return image.addBands(cosines).addBands(sines);
  };
};
// Filter to the area of interest, mask clouds, add variables.
var harmonicLandsat = landsatCollection
  .filterBounds(aoi2)
  .map(maskClouds)
  .map(addNDVI)
  .map(addDependents)
  .map(addHarmonics(harmonicFrequencies));
// The output of the regression reduction is a 4x1 array image.
var harmonicTrend = harmonicLandsat
  .select(independents.add(dependent))
  .reduce(ee.Reducer.linearRegression(independents.length(), 1));
// Turn the array image into a multi-band image of coefficients.
var harmonicTrendCoefficients = harmonicTrend.select('coefficients')
  .arrayProject([0])
  .arrayFlatten([independents]);
// Compute fitted values.
var fittedHarmonic = harmonicLandsat.map(function(image) {
  return image.addBands(
    image.select(independents)
      .multiply(harmonicTrendCoefficients)
      .reduce('sum')
      .rename('fitted'));
});
// Plot the fitted model and the original data at the AOI. ***
print(ui.Chart.image.series(fittedHarmonic.select(['fitted','NDVI']), aoi2, ee.Reducer.mean(), 30)
    .setOptions({
      //title: 'NDVI for Field1-Isosuo, Tyrnävä using Landsat 8 product from 2013-04-11 to 2021-05-01',
      //title: 'NDVI for Field1-Isosuo, Tyrnävä using Landsat 7 product from 1999-01-01 to 2021-04-08',
      //title: 'NDVI for Field1-Isosuo, Tyrnävä using Landsat 5 product from 1984-01-01 to 2012-05-05',
      lineWidth: 1,
      pointSize: 3,
}));
// Pull out the three bands we're going to visualize.
var sin = harmonicTrendCoefficients.select('sin_1');
var cos = harmonicTrendCoefficients.select('cos_1');
// Do some math to turn the first-order Fourier model into
// hue, saturation, and value in the range[0,1].
var magnitude = cos.hypot(sin).multiply(5);
var phase = sin.atan2(cos).unitScale(-Math.PI, Math.PI);
var val = harmonicLandsat.select('NDVI').reduce('mean');
// Turn the HSV data into an RGB image and add it to the map.
//var seasonality = ee.Image.cat(phase, magnitude, val).hsvToRgb();
//Map.centerObject(roi, 11);
//Map.addLayer(seasonality, {}, 'Seasonality');
//Map.addLayer(roi, {}, 'ROI');
// to dispaly AOI
Map.addLayer(ee.Image().paint(roi, 0, 2), {palette: 'FF0000'}, 'Box Outline');//Outer box
Map.addLayer(ee.Image().paint(aoi1, 0,2), {palette: 'f6c90e'}, 'Field1');