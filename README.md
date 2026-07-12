

# Inspiration
Most good calorie-tracking apps are locked behind a paywall or don't include all the features you need to track your progress neatly. Meet CalPal, your all-in-one calorie-tracking assistant that uses Google Gemini to scan nutrition labels if our database doesn't have your food! Reach your fitness goals with CalPal, organized, safely, and neatly.

## What it does

CalPal logs meals and tracks calories, protein, carbs, fiber, and any other nutrient you choose to watch, with a camera-based label scanner and USDA food search so you rarely type numbers by hand. Save a food once, log it later at any serving size, build custom foods from multiple ingredients, and tap any day in your history to see its full macro breakdown.

## How we built it

React, Vite, and TypeScript on the frontend, with Supabase handling Google login, the database, and label photo storage. Label scanning runs through Gemini, and food search hits USDA's FoodData Central API, both via serverless functions we migrated from Netlify to Cloudflare Pages mid-build.

## Challenges we ran into

Unfortunately, during testing, we had burned through our credits on Netlify! Our biggest challenge was switching over from Netlify to Cloudflare, which required learning a whole new platform! Another problem was that USDA's API was more literal than expected; it needed the correct spelling and capitalization to find the food, so we tried to fix that.

## Accomplishments that we're proud of

Our AI label scanning! It can scan your nutritional label and be added to custom recipes later, and the serving sizes can be manipulated as well! And our biggest, biggest accomplishment has to be the hosting migration! That was pulled off with only 3 hours left! 

## What we learned

We learned how to host on Cloudflare! That alone was a huge hurdle. We also learned how to navigate Vite and Netlify a little more.

## What's next for CalPal

We want to incorporate custom diet plans for those who'd benefit! Vegetarians, vegans, and other similar diets can struggle to meet their goals due to their lifestyles, so we hope to add recipes to help them get there.
