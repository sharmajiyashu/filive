import dotenv from 'dotenv';
import path from 'path';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {}

dotenv.config({ path: path.join(process.cwd(), '.env') });

import createDbConnection from '../src/api/loaders/db';
import '../src/models/Media';
import '../src/models/Career';
import '../src/models/StoreItem';
import '../src/models/Family';
import '../src/models/Level';
import { StoryService } from '../src/services/app/StoryService';
import { UserService } from '../src/services/app/UserService';
import { CloudinaryService } from '../src/services/common/CloudinaryService';
import { MediaService } from '../src/services/common/MediaService';
import { LevelService } from '../src/services/app/LevelService';
import User from '../src/models/User';

async function main() {
  await createDbConnection();

  console.log('--- Testing StoryService getExploreStories ---');
  const storyService = new StoryService(null as any, new MediaService());
  const storiesRes = await storyService.getExploreStories(undefined, 1, 5, 'popular');
  console.log('Total stories found:', storiesRes.stories.length);
  if (storiesRes.stories.length > 0) {
    const firstStoryUser = storiesRes.stories[0].user;
    console.log('Sample Story Author User keys:', Object.keys(firstStoryUser || {}));
    console.log('Sample Story Author dob:', firstStoryUser?.dob);
    console.log('Sample Story Author gender:', firstStoryUser?.gender);
    console.log('Sample Story Author country:', firstStoryUser?.country);
  }

  console.log('\n--- Testing UserService getUserDetail ---');
  const userService = new UserService(new LevelService());
  const anyUser = await User.findOne({ userRole: 'user' });
  if (anyUser) {
    const detail = await userService.getUserDetail(anyUser._id.toString());
    console.log('User detail keys:', Object.keys(detail));
    console.log('followedLiveStreams length:', detail.followedLiveStreams?.length);
    console.log('following data length:', detail.following?.data?.length);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
