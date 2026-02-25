package expo.modules.playgames

import android.app.Activity
import android.util.Log
import com.google.android.gms.games.LeaderboardsClient
import com.google.android.gms.games.PlayGames
import com.google.android.gms.games.PlayGamesSdk
import com.google.android.gms.games.leaderboard.LeaderboardVariant
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "ExpoPlayGames"

private const val E_UNAVAILABLE = "E_PLAYGAMES_UNAVAILABLE"
private const val E_NOT_SIGNED_IN = "E_PLAYGAMES_NOT_SIGNED_IN"
private const val E_NO_ACTIVITY = "E_PLAYGAMES_NO_ACTIVITY"

private const val RC_LEADERBOARD_UI = 9004

class ExpoPlayGamesModule : Module() {

  private var isInitialized = false
  private var isSignedIn = false

  private fun currentActivity(): Activity? =
    appContext.activityProvider?.currentActivity

  private fun requireActivity(promise: Promise): Activity? {
    val activity = currentActivity()
    if (activity == null) {
      promise.reject(CodedException(E_NO_ACTIVITY, "No current activity available", null))
    }
    return activity
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoPlayGames")

    // ── Lifecycle: initialize SDK when module is created ──
    OnCreate {
      val ctx = appContext.reactContext ?: return@OnCreate
      try {
        PlayGamesSdk.initialize(ctx)
        isInitialized = true
        Log.d(TAG, "PlayGamesSdk.initialize OK")
      } catch (e: Exception) {
        Log.e(TAG, "PlayGamesSdk.initialize FAILED: ${e.message}")
      }
    }

    // ── authenticate ──
    // Checks sign-in silently, then resolves with { playerId, alias } or null.
    AsyncFunction("authenticate") { promise: Promise ->
      val activity = requireActivity(promise) ?: return@AsyncFunction
      if (!isInitialized) {
        promise.resolve(null)
        return@AsyncFunction
      }

      val signInClient = PlayGames.getGamesSignInClient(activity)
      signInClient.isAuthenticated.addOnCompleteListener { authTask ->
        if (authTask.isSuccessful && authTask.result.isAuthenticated) {
          isSignedIn = true
          Log.d(TAG, "authenticate: signed in, fetching player info")

          val playersClient = PlayGames.getPlayersClient(activity)
          playersClient.currentPlayer.addOnSuccessListener { player ->
            val result = mapOf(
              "playerId" to player.playerId,
              "alias" to player.displayName
            )
            Log.d(TAG, "authenticate: playerId=${player.playerId} alias=${player.displayName}")
            promise.resolve(result)
          }.addOnFailureListener { e ->
            Log.e(TAG, "authenticate: getCurrentPlayer failed: ${e.message}")
            promise.resolve(null)
          }
        } else {
          isSignedIn = false
          Log.d(TAG, "authenticate: not signed in")
          promise.resolve(null)
        }
      }
    }

    // ── submitScore ──
    // Fire-and-forget. Uses the void (non-immediate) variant.
    AsyncFunction("submitScore") { score: Int, leaderboardId: String, promise: Promise ->
      val activity = requireActivity(promise) ?: return@AsyncFunction
      if (!isSignedIn) {
        promise.reject(CodedException(E_NOT_SIGNED_IN, "Player is not signed in", null))
        return@AsyncFunction
      }

      val client = PlayGames.getLeaderboardsClient(activity)
      client.submitScore(leaderboardId, score.toLong())
      Log.d(TAG, "submitScore: score=$score leaderboard=$leaderboardId")
      promise.resolve(null)
    }

    // ── fetchFriendsScores ──
    // Loads player-centered scores from the FRIENDS collection.
    // Returns an array of { rank, score, playerId, alias, formattedScore }.
    // Catches FriendsResolutionRequiredException and returns [].
    AsyncFunction("fetchFriendsScores") { leaderboardId: String, promise: Promise ->
      val activity = requireActivity(promise) ?: return@AsyncFunction
      if (!isSignedIn) {
        promise.resolve(emptyList<Map<String, Any>>())
        return@AsyncFunction
      }

      val client = PlayGames.getLeaderboardsClient(activity)
      client.loadPlayerCenteredScores(
        leaderboardId,
        LeaderboardVariant.TIME_SPAN_ALL_TIME,
        LeaderboardVariant.COLLECTION_FRIENDS,
        25
      ).addOnSuccessListener { data ->
        val scores = data.get()
        val scoresBuffer = scores?.scores
        val result = mutableListOf<Map<String, Any>>()

        if (scoresBuffer != null) {
          for (i in 0 until scoresBuffer.count) {
            val entry = scoresBuffer[i]
            result.add(
              mapOf(
                "rank" to entry.rank,
                "score" to entry.rawScore,
                "playerId" to entry.scoreHolderDisplayName,
                "alias" to entry.scoreHolderDisplayName,
                "formattedScore" to entry.displayScore
              )
            )
          }
        }
        scores?.release()

        Log.d(TAG, "fetchFriendsScores: ${result.size} entries")
        promise.resolve(result)
      }.addOnFailureListener { e ->
        Log.w(TAG, "fetchFriendsScores: failed — ${e.message}")
        promise.resolve(emptyList<Map<String, Any>>())
      }
    }

    // ── presentDashboard ──
    // Opens the native Play Games leaderboard UI via startActivityForResult.
    AsyncFunction("presentDashboard") { leaderboardId: String?, promise: Promise ->
      val activity = requireActivity(promise) ?: return@AsyncFunction
      if (!isSignedIn) {
        promise.reject(CodedException(E_NOT_SIGNED_IN, "Player is not signed in", null))
        return@AsyncFunction
      }

      val client = PlayGames.getLeaderboardsClient(activity)
      val intentTask = if (!leaderboardId.isNullOrEmpty()) {
        client.getLeaderboardIntent(leaderboardId)
      } else {
        client.allLeaderboardsIntent
      }

      intentTask.addOnSuccessListener { intent ->
        activity.startActivityForResult(intent, RC_LEADERBOARD_UI)
        promise.resolve(null)
      }.addOnFailureListener { e ->
        Log.e(TAG, "presentDashboard: failed — ${e.message}")
        promise.reject(CodedException(E_UNAVAILABLE, e.message ?: "Failed to open leaderboard", null))
      }
    }

    // ── isAvailable (sync) ──
    Function("isAvailable") {
      return@Function isInitialized
    }
  }
}
