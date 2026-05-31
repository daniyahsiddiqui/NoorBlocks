// NoorBlocks Supabase Integration Wrapper
let supabaseClient = null;

if (typeof supabase !== 'undefined' && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
  supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

const db = {
  isOnline() {
    return supabaseClient !== null;
  },

  getClient() {
    return supabaseClient;
  },

  // ════════════ AUTH API ════════════
  async signUp(username, password, displayName) {
    if (!this.isOnline()) return { error: { message: "Offline Mode active" } };
    
    // Check if username is already taken
    const { data: existing } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle();

    if (existing) {
      return { error: { message: "Username is already taken." } };
    }

    const email = username.trim().toLowerCase() + "@noorblocks.local";

    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password
    });

    if (error) return { error };

    if (data.user) {
      // Create user profile in profiles table
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .insert({
          id: data.user.id,
          username: username.trim().toLowerCase(),
          display_name: displayName.trim() || username
        });
      
      if (profileError) return { error: profileError };
    }

    return { data };
  },

  async login(username, password) {
    if (!this.isOnline()) return { error: { message: "Offline Mode active" } };
    const email = username.trim().toLowerCase() + "@noorblocks.local";
    return await supabaseClient.auth.signInWithPassword({ email, password });
  },

  async logout() {
    if (!this.isOnline()) return;
    return await supabaseClient.auth.signOut();
  },

  onAuthChange(callback) {
    if (!this.isOnline()) return;
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        callback(session.user, profile);
      } else {
        callback(null, null);
      }
    });
  },

  // ════════════ LEADERBOARD API ════════════
  async uploadScore(surahNum, difficulty, gameMode, score, accuracy) {
    if (!this.isOnline()) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    return await supabaseClient
      .from('leaderboard')
      .insert({
        user_id: user.id,
        surah_num: surahNum,
        difficulty: difficulty,
        game_mode: gameMode,
        score: score,
        accuracy: accuracy
      });
  },

  async fetchGlobalLeaderboard(surahNum, difficulty, gameMode) {
    if (!this.isOnline()) return [];
    let query = supabaseClient
      .from('leaderboard')
      .select('score, accuracy, created_at, profiles(username, display_name)')
      .order('score', { ascending: false })
      .limit(10);

    if (surahNum) query = query.eq('surah_num', surahNum);
    if (difficulty) query = query.eq('difficulty', difficulty);
    if (gameMode) query = query.eq('game_mode', gameMode);

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return [];
    }
    return data;
  },

  async fetchFriendsLeaderboard(surahNum, difficulty, gameMode) {
    if (!this.isOnline()) return [];
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return [];

    // Get friend IDs
    const { data: friends } = await supabaseClient
      .from('friendships')
      .select('sender_id, receiver_id')
      .eq('status', 'accepted');

    if (!friends) return [];

    const friendIds = friends.map(f => f.sender_id === user.id ? f.receiver_id : f.sender_id);
    friendIds.push(user.id); // Include user's own score

    let query = supabaseClient
      .from('leaderboard')
      .select('score, accuracy, created_at, profiles(username, display_name)')
      .in('user_id', friendIds)
      .order('score', { ascending: false })
      .limit(10);

    if (surahNum) query = query.eq('surah_num', surahNum);
    if (difficulty) query = query.eq('difficulty', difficulty);
    if (gameMode) query = query.eq('game_mode', gameMode);

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return [];
    }
    return data;
  },

  // ════════════ SOCIAL/FRIENDS API ════════════
  async searchProfiles(searchStr) {
    if (!this.isOnline()) return [];
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, username, display_name')
      .ilike('username', `%${searchStr}%`)
      .limit(10);
    if (error) return [];
    return data;
  },

  async sendFriendRequest(targetUserId) {
    if (!this.isOnline()) return { error: { message: "Offline Mode active" } };
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return { error: { message: "Not logged in" } };

    return await supabaseClient
      .from('friendships')
      .insert({
        sender_id: user.id,
        receiver_id: targetUserId,
        status: 'pending'
      });
  },

  async getFriendships() {
    if (!this.isOnline()) return [];
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return [];

    // Fetch friendships where user is sender or receiver
    const { data, error } = await supabaseClient
      .from('friendships')
      .select(`
        id, status, sender_id, receiver_id,
        sender:profiles!friendships_sender_id_fkey(id, username, display_name),
        receiver:profiles!friendships_receiver_id_fkey(id, username, display_name)
      `);

    if (error) return [];
    return data;
  },

  async acceptFriendRequest(friendshipId) {
    if (!this.isOnline()) return;
    return await supabaseClient
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date() })
      .eq('id', friendshipId);
  },

  // ════════════ MULTIPLAYER LOBBY ROOMS API ════════════
  async createRoom(surahNum, rangeStart, rangeEnd, difficulty, gameMode) {
    if (!this.isOnline()) return { error: "Offline Mode active" };
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return { error: "Not logged in" };

    // Generate random 6-character room invite code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data: room, error: roomError } = await supabaseClient
      .from('rooms')
      .insert({
        invite_code: code,
        host_id: user.id,
        surah_num: surahNum,
        range_start: rangeStart,
        range_end: rangeEnd,
        difficulty: difficulty,
        game_mode: gameMode,
        status: 'waiting'
      })
      .select()
      .single();

    if (roomError) return { error: roomError.message };

    // Add host as a participant
    await supabaseClient
      .from('room_participants')
      .insert({
        room_id: room.id,
        user_id: user.id,
        status: 'joined'
      });

    return { room };
  },

  async joinRoom(inviteCode) {
    if (!this.isOnline()) return { error: "Offline Mode active" };
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return { error: "Not logged in" };

    // Resolve invite code to room
    const { data: room, error: roomError } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('invite_code', inviteCode.trim().toUpperCase())
      .maybeSingle();

    if (roomError) return { error: roomError.message };
    if (!room) return { error: "Room not found or code invalid." };
    if (room.status !== 'waiting') return { error: "This match has already started." };

    // Verify room size (max 8 players)
    const { count, error: countError } = await supabaseClient
      .from('room_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .in('status', ['joined', 'playing']);

    if (countError) return { error: countError.message };
    if (count >= 8) return { error: "This room is full (max 8 players)." };

    // Add user as participant
    const { error: partError } = await supabaseClient
      .from('room_participants')
      .insert({
        room_id: room.id,
        user_id: user.id,
        status: 'joined'
      });

    // If user was already in room, it may fail unique constraint, but we ignore
    return { room };
  },

  async updateParticipantStatus(roomId, status, score = null, accuracy = null) {
    if (!this.isOnline()) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    return await supabaseClient
      .from('room_participants')
      .update({
        status: status,
        final_score: score,
        final_accuracy: accuracy
      })
      .eq('room_id', roomId)
      .eq('user_id', user.id);
  },

  async setRoomStatus(roomId, status) {
    if (!this.isOnline()) return;
    return await supabaseClient
      .from('rooms')
      .update({ status: status })
      .eq('id', roomId);
  },

  async getRoomParticipants(roomId) {
    if (!this.isOnline()) return [];
    const { data, error } = await supabaseClient
      .from('room_participants')
      .select('id, status, final_score, final_accuracy, profiles(id, username, display_name)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) {
      console.error(error);
      return [];
    }
    return data;
  },

  // ════════════ REALTIME WEBSOCKET CHANNELS ════════════
  setupRoomChannel(roomId, onParticipantChange, onGameStarted, onStateReceived) {
    if (!this.isOnline()) return null;

    // 1. Create DB changes listener for lobby user lists
    const dbSubscription = supabaseClient
      .channel(`db:participants:${roomId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'room_participants',
        filter: `room_id=eq.${roomId}`
      }, () => {
        onParticipantChange();
      })
      .subscribe();

    // 2. Create broadcast listener for live match play
    const broadcastChannel = supabaseClient.channel(`broadcast:room:${roomId}`, {
      config: {
        broadcast: { self: false }
      }
    });

    broadcastChannel
      .on('broadcast', { event: 'start_game' }, ({ payload }) => {
        onGameStarted(payload);
      })
      .on('broadcast', { event: 'player_progress' }, ({ payload }) => {
        onStateReceived(payload);
      })
      .subscribe();

    return {
      channel: broadcastChannel,
      unsubscribe() {
        supabaseClient.removeChannel(dbSubscription);
        supabaseClient.removeChannel(broadcastChannel);
      }
    };
  }
};
